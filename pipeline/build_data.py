"""Build browser-sized ARES layers from aligned Mars GeoTIFFs.

Usage: python build_data.py <folder containing source .tif files> <output project folder>
Requires: rasterio, numpy, pillow. Source rasters are opened read-only.
The output JavaScript is replaced atomically only after all validation/encoding succeeds.
"""
import sys
import os
import io
import json
import math
import base64
import tempfile

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.windows import Window
from rasterio.transform import from_bounds
from rasterio.warp import reproject
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = sys.argv[2] if len(sys.argv) > 2 else "."
GW, GH = 1483, 541
R_MARS = 3396190.0
NAMES = {
    "dem": "ARES_route_region_1m_corrected",
    "slope": "ARES_slope_degrees_1m",
    "rough": "ARES_terrain_roughness_1m",
    "haz": "ARES_terrain_hazard_classes",
    "hill": "ARES_hillshade_1m",
    "opt": "ARES_optical_preview_2m",
}
F = {key: os.path.join(SRC, name + ".tif") for key, name in NAMES.items()}


def fail(message):
    raise SystemExit("RASTER VALIDATION FAILED: " + message)


def near(a, b, tol=1e-6):
    return abs(float(a) - float(b)) <= tol


def integer_or_reciprocal(value, label):
    value = abs(float(value))
    if value <= 0:
        fail(label + " must be non-zero")
    nearest = round(value)
    reciprocal = round(1.0 / value)
    if near(value, nearest, 1e-6) and nearest >= 1:
        return
    if near(1.0 / value, reciprocal, 1e-6) and reciprocal >= 1:
        return
    fail(label + " is not an integer-resolution multiple or divisor: " + str(value))


def validate_sources():
    missing = [path for path in F.values() if not os.path.isfile(path)]
    if missing:
        fail("missing source file(s): " + ", ".join(missing))

    datasets = {}
    try:
        for key, path in F.items():
            datasets[key] = rasterio.open(path)
        ref = datasets["dem"]
        if ref.crs is None:
            fail("DEM has no CRS")
        if ref.count < 1:
            fail("DEM has no raster band")
        rt = ref.transform
        if not near(rt.b, 0) or not near(rt.d, 0):
            fail("DEM is rotated or sheared; this pipeline only supports north-up grids")
        if rt.a <= 0 or rt.e >= 0:
            fail("DEM must have positive east-west and negative north-south pixel steps")

        for key, ds in datasets.items():
            if ds.crs != ref.crs:
                fail(key + " CRS differs from DEM: " + str(ds.crs) + " != " + str(ref.crs))
            if not near(ds.transform.b, 0) or not near(ds.transform.d, 0):
                fail(key + " is rotated or sheared; no implicit reprojection is performed")
            if ds.transform.a <= 0 or ds.transform.e >= 0:
                fail(key + " has an unsupported pixel-axis direction")
            tol = max(1e-4, min(abs(rt.a), abs(rt.e)) * 1e-4)
            for label, a, b in (("left bound", ds.bounds.left, ref.bounds.left),
                                ("right bound", ds.bounds.right, ref.bounds.right),
                                ("top bound", ds.bounds.top, ref.bounds.top),
                                ("bottom bound", ds.bounds.bottom, ref.bounds.bottom)):
                if not near(a, b, tol):
                    fail(key + " " + label + " does not match DEM (" + str(a) + " vs " + str(b) + ")")
            integer_or_reciprocal(ds.transform.a / rt.a, key + " x-resolution ratio")
            integer_or_reciprocal(ds.transform.e / rt.e, key + " y-resolution ratio")
            # Origins must coincide on the finer of the two pixel lattices.
            for label, offset, step in (("x origin", ds.transform.c - rt.c, min(abs(ds.transform.a), abs(rt.a))),
                                        ("y origin", ds.transform.f - rt.f, min(abs(ds.transform.e), abs(rt.e)))):
                if not near(offset / step, round(offset / step), 1e-5):
                    fail(key + " " + label + " is not aligned to the DEM pixel lattice")
            if ds.nodata is None:
                print("WARNING: " + key + " has no declared NoData value; the GDAL validity mask will still be used")

        # All analysis rasters are expected on the same 1 m grid. Optical may be a coarser aligned preview.
        for key in ("slope", "rough", "haz", "hill"):
            ds = datasets[key]
            if ds.width != ref.width or ds.height != ref.height or not near(ds.transform.a, rt.a) or not near(ds.transform.e, rt.e):
                fail(key + " must use the same dimensions and pixel resolution as the DEM")
        return datasets
    except Exception:
        for ds in datasets.values():
            ds.close()
        raise


def masked_read(ds, **kwargs):
    arr = ds.read(1, masked=True, **kwargs)
    data = np.asarray(arr.data)
    mask = np.ma.getmaskarray(arr) | ~np.isfinite(data)
    return np.ma.array(data, mask=mask, copy=False)


def down(ds, method, shape=(GH, GW)):
    # A downsampled output cell is valid only when its full source footprint is valid.
    # Otherwise a tiny valid remnant could average across a NoData boundary and look traversable.
    result = masked_read(ds, out_shape=shape, resampling=method)
    coverage = np.zeros(shape, dtype="uint8")
    reproject(
        source=ds.read_masks(1), destination=coverage,
        src_transform=ds.transform, src_crs=ds.crs,
        dst_transform=from_bounds(ds.bounds.left, ds.bounds.bottom, ds.bounds.right, ds.bounds.top, shape[1], shape[0]),
        dst_crs=ds.crs, resampling=Resampling.min,
    )
    complete = coverage == 255
    mask = np.ma.getmaskarray(result) | ~complete
    return np.ma.array(result.data, mask=mask, copy=False)


def b64(array):
    return base64.b64encode(np.ascontiguousarray(array).tobytes()).decode("ascii")


def source_statistics(ds):
    valid_count = 0
    nodata_count = 0
    minimum = float("inf")
    maximum = float("-inf")
    first_col_min = None
    first_col_max = None
    for y in range(0, ds.height, 512):
        win = Window(0, y, ds.width, min(512, ds.height - y))
        block = masked_read(ds, window=win)
        valid = ~np.ma.getmaskarray(block)
        values = np.asarray(block.data)[valid]
        valid_count += int(valid.sum())
        nodata_count += int(valid.size - valid.sum())
        if values.size:
            minimum = min(minimum, float(values.min()))
            maximum = max(maximum, float(values.max()))
            rows = valid.any(axis=1)
            if rows.any():
                first = np.argmax(valid[rows], axis=1)
                lo, hi = int(first.min()), int(first.max())
                first_col_min = lo if first_col_min is None else min(first_col_min, lo)
                first_col_max = hi if first_col_max is None else max(first_col_max, hi)
    return {
        "valid_count": valid_count,
        "nodata_count": nodata_count,
        "valid_pct": 100.0 * valid_count / (ds.width * ds.height),
        "min_valid": minimum if valid_count else None,
        "max_valid": maximum if valid_count else None,
        "nodata_value": ds.nodata,
        "crs": str(ds.crs),
        "width": ds.width,
        "height": ds.height,
        "transform": list(ds.transform)[:6],
        "bounds": [ds.bounds.left, ds.bounds.bottom, ds.bounds.right, ds.bounds.top],
        "first_col_min": first_col_min,
        "first_col_max": first_col_max,
    }


def main():
    datasets = validate_sources()
    try:
        dem_ds, slope_ds, rough_ds = datasets["dem"], datasets["slope"], datasets["rough"]
        haz_ds, hill_ds, opt_ds = datasets["haz"], datasets["hill"], datasets["opt"]
        W0, H0 = dem_ds.width, dem_ds.height
        B = dem_ds.bounds
        lat0 = math.degrees(((B.top + B.bottom) / 2) / R_MARS)
        cos_lat = math.cos(math.radians(lat0))

        # Full-resolution QA uses source masks/NoData metadata, not numeric sentinel guesses.
        source_stats = {key: source_statistics(ds) for key, ds in datasets.items()}
        both = dem_only = slope_only = neither = 0
        nonfinite_valid = 0
        hazard_counts = {1: 0, 2: 0, 3: 0, 4: 0}
        for y in range(0, H0, 512):
            win = Window(0, y, W0, min(512, H0 - y))
            dem_raw = dem_ds.read(1, window=win, masked=True)
            slope_raw = slope_ds.read(1, window=win, masked=True)
            dem_nonfinite = ~np.ma.getmaskarray(dem_raw) & ~np.isfinite(np.asarray(dem_raw.data))
            slope_nonfinite = ~np.ma.getmaskarray(slope_raw) & ~np.isfinite(np.asarray(slope_raw.data))
            nonfinite_valid += int(dem_nonfinite.sum() + slope_nonfinite.sum())
            dem_block = masked_read(dem_ds, window=win)
            slope_block = masked_read(slope_ds, window=win)
            haz_block = masked_read(haz_ds, window=win)
            dv = ~np.ma.getmaskarray(dem_block)
            sv = ~np.ma.getmaskarray(slope_block)
            both += int((dv & sv).sum())
            neither += int((~dv & ~sv).sum())
            dem_only += int((dv & ~sv).sum())
            slope_only += int((~dv & sv).sum())
            haz_valid = ~np.ma.getmaskarray(haz_block)
            for cls in hazard_counts:
                hazard_counts[cls] += int(((np.asarray(haz_block.data) == cls) & haz_valid).sum())
        pixels = W0 * H0

        # Downsample masked rasters; masked pixels remain masked rather than becoming plausible values.
        dem_m = down(dem_ds, Resampling.average)
        dem_data = np.asarray(dem_m.data, dtype="float64")
        dem_valid = ~np.ma.getmaskarray(dem_m) & np.isfinite(dem_data)
        if not dem_valid.any():
            fail("DEM contains no valid cells after downsampling")
        zmin, zmax = float(dem_data[dem_valid].min()), float(dem_data[dem_valid].max())
        if not zmax > zmin:
            fail("DEM has no usable elevation range")
        u16 = np.full((GH, GW), 65535, dtype="<u2")
        u16[dem_valid] = np.clip(np.round((dem_data[dem_valid] - zmin) / (zmax - zmin) * 65534), 0, 65534).astype("<u2")

        sl_m = down(slope_ds, Resampling.average)
        sl_data = np.asarray(sl_m.data, dtype="float64")
        sl_valid = ~np.ma.getmaskarray(sl_m) & np.isfinite(sl_data)
        sl8 = np.full((GH, GW), 255, dtype="u1")
        sl8[sl_valid] = np.clip(np.round(sl_data[sl_valid] * 3), 0, 254).astype("u1")

        ro_m = down(rough_ds, Resampling.average)
        ro_data = np.asarray(ro_m.data, dtype="float64")
        ro_valid = ~np.ma.getmaskarray(ro_m) & np.isfinite(ro_data)
        ro8 = np.full((GH, GW), 255, dtype="u1")
        ro8[ro_valid] = np.clip(np.round(ro_data[ro_valid] * 40), 0, 254).astype("u1")

        hz_m = down(haz_ds, Resampling.mode)
        hz_data = np.asarray(hz_m.data)
        hz_valid = ~np.ma.getmaskarray(hz_m) & np.isin(hz_data, [1, 2, 3, 4])
        hz8 = np.zeros((GH, GW), dtype="u1")
        hz8[hz_valid] = hz_data[hz_valid].astype("u1")

        hill_m = down(hill_ds, Resampling.average)
        hill_data = np.asarray(hill_m.data, dtype="float64")
        hill_valid = ~np.ma.getmaskarray(hill_m) & np.isfinite(hill_data)
        hs8 = np.zeros((GH, GW), dtype="u1")
        hs8[hill_valid] = np.clip(np.round(hill_data[hill_valid]), 0, 255).astype("u1")

        opt_h = max(1, int(round(opt_ds.height * 2048 / opt_ds.width)))
        opt_m = down(opt_ds, Resampling.average, shape=(opt_h, 2048))
        opt_data = np.asarray(opt_m.data, dtype="float64")
        opt_valid = ~np.ma.getmaskarray(opt_m) & np.isfinite(opt_data)
        opt8 = np.zeros((opt_h, 2048), dtype="u1")
        opt8[opt_valid] = np.clip(np.round(opt_data[opt_valid]), 0, 255).astype("u1")
        buf = io.BytesIO()
        Image.fromarray(opt8).save(buf, "JPEG", quality=84)

        dem_stats = source_stats["dem"]
        qa = {
            "both": both, "dem_only": dem_only, "slope_only": slope_only, "neither": neither,
            "nonfinite_valid": nonfinite_valid,
            "first_col_min": dem_stats["first_col_min"], "first_col_max": dem_stats["first_col_max"],
            "dem_valid_pct": 100.0 * (both + dem_only) / pixels,
            "slope_valid_pct": 100.0 * (both + slope_only) / pixels,
            "hazard_class_counts": hazard_counts, "pixels": pixels,
            "sources": source_stats,
            "web_valid_counts": {
                "dem": int(dem_valid.sum()), "slope": int(sl_valid.sum()), "rough": int(ro_valid.sum()),
                "hazard": int(hz_valid.sum()), "hillshade": int(hill_valid.sum()),
            },
        }
        meta = dict(
            gw=GW, gh=GH, src_w=W0, src_h=H0,
            x0=B.left, y1=B.top, x1=B.right, y0=B.bottom,
            cell_x_proj=(B.right - B.left) / GW, cell_y=(B.top - B.bottom) / GH,
            lat0=lat0, cos_lat=cos_lat, R=R_MARS,
            zmin=zmin, zmax=zmax, z_mean=float(dem_data[dem_valid].mean()),
            valid_web_pct=float(100 * dem_valid.mean()),
            slope_scale=3, rough_scale=40, qa=qa,
            resampling={"dem": "average", "slope": "average", "rough": "average", "haz": "mode", "hill": "average", "opt": "average"},
            pixel_reference="DEM outer bounds; browser grid coordinates refer to pixel centres",
            nodata_downsample_policy="output cells are valid only when their full source footprint has valid mask coverage",
        )
        payload = dict(meta=meta, dem=b64(u16), slope=b64(sl8), rough=b64(ro8), haz=b64(hz8), hill=b64(hs8),
                       opt="data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii"))
        out_dir = os.path.join(OUT, "data")
        os.makedirs(out_dir, exist_ok=True)
        destination = os.path.join(out_dir, "ares-data.js")
        fd, temporary = tempfile.mkstemp(prefix="ares-data-", suffix=".js.tmp", dir=out_dir)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write("window.ARES_DATA=" + json.dumps(payload, separators=(",", ":"), allow_nan=False) + ";")
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(temporary, destination)
        except Exception:
            try:
                os.unlink(temporary)
            except OSError:
                pass
            raise
        print(json.dumps(meta, indent=2, allow_nan=False))
        print("Wrote validated output atomically:", destination)
    finally:
        for ds in datasets.values():
            ds.close()


if __name__ == "__main__":
    main()

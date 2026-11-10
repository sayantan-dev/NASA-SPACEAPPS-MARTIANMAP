"""Synthetic GeoTIFF tests for pipeline alignment, NoData masks, and atomic output.
Run from the project root: python tests/pipeline.test.py
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest
import importlib.util

import numpy as np
import rasterio
from rasterio.transform import from_origin

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILDER = os.path.join(ROOT, "pipeline", "build_data.py")


class PipelineValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="ares-pipeline-test-")
        self.src = os.path.join(self.temp.name, "src")
        self.out = os.path.join(self.temp.name, "out")
        os.makedirs(self.src)
        os.makedirs(os.path.join(self.out, "data"))
        self.transform = from_origin(1000, 2000, 1, 1)
        self.crs = "EPSG:4326"
        self._write_sources()

    def tearDown(self):
        self.temp.cleanup()

    def _write(self, name, array, nodata, transform=None):
        path = os.path.join(self.src, name + ".tif")
        with rasterio.open(
            path, "w", driver="GTiff", width=array.shape[1], height=array.shape[0],
            count=1, dtype=array.dtype, crs=self.crs,
            transform=transform or self.transform, nodata=nodata,
        ) as dataset:
            dataset.write(array, 1)
        return path

    def _write_sources(self):
        base = np.arange(48, dtype="float32").reshape(6, 8)
        dem = base.copy(); dem[0, 0] = -9999
        slope = np.full((6, 8), 5, dtype="float32"); slope[0, 0] = -9999
        rough = np.full((6, 8), 0.2, dtype="float32"); rough[0, 0] = -9999
        hazard = np.tile(np.array([1, 2, 3, 4, 1, 2, 3, 4], dtype="uint8"), (6, 1)); hazard[0, 0] = 0
        hill = np.full((6, 8), 128, dtype="uint8"); hill[0, 0] = 0
        self._write("ARES_route_region_1m_corrected", dem, -9999)
        self._write("ARES_slope_degrees_1m", slope, -9999)
        self._write("ARES_terrain_roughness_1m", rough, -9999)
        self._write("ARES_terrain_hazard_classes", hazard, 0)
        self._write("ARES_hillshade_1m", hill, 0)
        optical = np.full((3, 4), 120, dtype="uint8")
        self._write("ARES_optical_preview_2m", optical, 0, from_origin(1000, 2000, 2, 2))

    def _run(self):
        return subprocess.run(
            [sys.executable, BUILDER, self.src, self.out],
            cwd=ROOT, capture_output=True, text=True,
        )

    def test_aligned_sources_build_and_preserve_nodata(self):
        result = self._run()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        output = os.path.join(self.out, "data", "ares-data.js")
        with open(output, encoding="utf-8") as handle:
            source = handle.read()
        self.assertTrue(source.startswith("window.ARES_DATA="))
        payload = json.loads(source[len("window.ARES_DATA="):-1])
        self.assertEqual(payload["meta"]["gw"], 1483)
        self.assertEqual(payload["meta"]["gh"], 541)
        self.assertEqual(payload["meta"]["pixel_reference"], "DEM outer bounds; browser grid coordinates refer to pixel centres")
        self.assertGreater(payload["meta"]["qa"]["web_valid_counts"]["dem"], 0)
        self.assertLess(payload["meta"]["qa"]["web_valid_counts"]["dem"], 1483 * 541)
        self.assertIn("full source footprint", payload["meta"]["nodata_downsample_policy"])
        self.assertEqual(payload["meta"]["resampling"]["haz"], "mode")

    def test_partial_nodata_footprint_is_invalidated_during_downsampling(self):
        spec = importlib.util.spec_from_file_location("ares_build_data", BUILDER)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        path = os.path.join(self.src, "ARES_route_region_1m_corrected.tif")
        with rasterio.open(path) as dataset:
            reduced = module.down(dataset, rasterio.enums.Resampling.average, shape=(3, 4))
        mask = np.ma.getmaskarray(reduced)
        self.assertTrue(mask[0, 0], "one NoData source pixel must invalidate its 2x2 output footprint")
        self.assertFalse(mask[1, 1], "a fully valid source footprint should remain valid")

    def test_misaligned_input_fails_without_overwriting_existing_output(self):
        output = os.path.join(self.out, "data", "ares-data.js")
        with open(output, "w", encoding="utf-8") as handle:
            handle.write("KEEP_EXISTING_OUTPUT")
        slope_path = os.path.join(self.src, "ARES_slope_degrees_1m.tif")
        with rasterio.open(slope_path, "r+") as dataset:
            dataset.transform = from_origin(1000.5, 2000, 1, 1)
        result = self._run()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("RASTER VALIDATION FAILED", result.stdout + result.stderr)
        with open(output, encoding="utf-8") as handle:
            self.assertEqual(handle.read(), "KEEP_EXISTING_OUTPUT")


if __name__ == "__main__":
    unittest.main(verbosity=2)

from pathlib import Path
import sys
import os
import subprocess
import tempfile
from PIL import Image, ImageOps

source = Path(sys.argv[1])
destination = Path(sys.argv[2])

def open_image(path):
    try:
        return Image.open(path), None
    except Image.UnidentifiedImageError:
        # Pillow on Windows commonly lacks a HEIC decoder. ffmpeg provides a
        # local fallback; it creates a temporary PNG that is removed below.
        file_descriptor, temporary_path = tempfile.mkstemp(suffix=".png")
        os.close(file_descriptor)
        temporary = Path(temporary_path)
        try:
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(path), "-frames:v", "1", str(temporary)], check=True)
            return Image.open(temporary), temporary
        except Exception:
            temporary.unlink(missing_ok=True)
            raise

original, fallback = open_image(source)
try:
    image = ImageOps.exif_transpose(original)
    image.thumbnail((1920, 1920), Image.Resampling.LANCZOS)
    image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=82, method=6)
finally:
    original.close()
    if fallback:
        fallback.unlink(missing_ok=True)

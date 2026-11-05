
from pathlib import Path
from PIL import Image, ImageOps

SOURCE = Path(r"D:\Projects\webUI\public\Photos")
OUTPUT = SOURCE / "optimized"

SUPPORTED = {
    ".jpg", ".jpeg", ".png", ".bmp",
    ".tif", ".tiff", ".webp"
}

QUALITY = 82
MAX_SIZE = (1920, 1920)

OUTPUT.mkdir(parents=True, exist_ok=True)

converted = 0
failed = 0

for file in SOURCE.rglob("*"):
    if not file.is_file():
        continue

    # Do not convert files inside the output folder again.
    if OUTPUT in file.parents:
        continue

    if file.suffix.lower() not in SUPPORTED:
        continue

    try:
        with Image.open(file) as original:
            image = ImageOps.exif_transpose(original)
            image.thumbnail(MAX_SIZE, Image.Resampling.LANCZOS)

            # WebP supports RGB and RGBA; preserve transparency.
            if "A" in image.getbands():
                image = image.convert("RGBA")
            else:
                image = image.convert("RGB")

            relative = file.relative_to(SOURCE)
            destination = (OUTPUT / relative).with_suffix(".webp")
            destination.parent.mkdir(parents=True, exist_ok=True)

            image.save(
                destination,
                "WEBP",
                quality=QUALITY,
                method=6
            )

        converted += 1
        print(f"Converted: {file.name} -> {destination.name}")

    except Exception as error:
        failed += 1
        print(f"FAILED: {file} | {error}")

print(f"\nDone! Converted: {converted}, Failed: {failed}")
print(f"Output folder: {OUTPUT}")

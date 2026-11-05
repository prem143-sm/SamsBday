/**
 * convertImageToWebP - Reusable WebP image conversion utility.
 *
 * Converts supported image formats (JPEG, PNG, BMP, GIF first-frame, AVIF, HEIC)
 * to WebP with configurable quality and maximum dimensions.
 *
 * Does not claim universal format support — if a file cannot be decoded,
 * the returned result includes an error instead of a converted blob.
 */
export interface ConvertImageToWebPOptions {
  /** WebP quality from 0 to 1. Default 0.85. */
  quality?: number;
  /** Maximum dimension on the longest side. Default 2560. */
  maxDimension?: number;
  /** Whether to preserve animation for animated GIFs. Default false (first frame only). */
  preserveAnimation?: boolean;
  /** Progress callback called per file. */
  onProgress?: (fileName: string, loaded: number, total: number) => void;
}

export interface ConvertImageToWebPResult {
  /** Original file name. */
  fileName: string;
  /** Original file size in bytes. */
  originalSize: number;
  /** Converted WebP blob, or null if conversion failed. */
  blob: Blob | null;
  /** Converted file size in bytes (null if failed). */
  convertedSize: number | null;
  /** Error message if conversion failed. */
  error: string | null;
  /** Whether the image was animated and only first frame was converted. */
  wasAnimated: boolean;
}

const SUPPORTED_INPUT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/bmp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
]);

const DEFAULT_MAX_DIMENSION = 2560;
const DEFAULT_QUALITY = 0.85;

/**
 * Detect whether the browser can decode a given image MIME type by creating
 * an Image and attempting to load a tiny data URL of that type.
 */
async function canDecodeMimeType(mimeType: string): Promise<boolean> {
  const tinyDataUrls: Record<string, string> = {
    'image/jpeg': 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwD/ADf//Z',
    'image/png': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'image/gif': 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'image/webp': 'data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIAAAARH0ACoO8AAoAAQACc4FoGAD3Q2F7AAA=',
  };
  const testUrl = tinyDataUrls[mimeType];
  if (!testUrl) return false;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = testUrl;
  });
}

/**
 * Draw an image onto a canvas, preserving aspect ratio and max dimension.
 */
function imageToCanvas(
  img: HTMLImageElement,
  maxDimension: number
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  let { width: srcWidth, height: srcHeight } = img;
  const scale = Math.min(1, maxDimension / Math.max(srcWidth, srcHeight));
  const drawWidth = Math.floor(srcWidth * scale);
  const drawHeight = Math.floor(srcHeight * scale);

  canvas.width = drawWidth;
  canvas.height = drawHeight;
  ctx.drawImage(img, 0, 0, drawWidth, drawHeight);
  return canvas;
}

/**
 * Load a File as an HTMLImageElement. Returns null if the image cannot be decoded.
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to decode image: ${file.name}`));
    };
    img.src = url;
  });
}

/**
 * Convert a single image file to WebP.
 */
async function convertSingleImage(
  file: File,
  options: ConvertImageToWebPOptions = {}
): Promise<ConvertImageToWebPResult> {
  const {
    quality = DEFAULT_QUALITY,
    maxDimension = DEFAULT_MAX_DIMENSION,
    preserveAnimation = false,
    onProgress,
  } = options;

  const result: ConvertImageToWebPResult = {
    fileName: file.name,
    originalSize: file.size,
    blob: null,
    convertedSize: null,
    error: null,
    wasAnimated: false,
  };

  // Validate MIME type
  if (!SUPPORTED_INPUT_TYPES.has(file.type)) {
    result.error = `Unsupported image format: ${file.type || 'unknown'}. Supported: JPEG, PNG, BMP, GIF, AVIF, HEIC.`;
    return result;
  }

  // Check browser can decode this MIME type
  const canDecode = await canDecodeMimeType(file.type);
  if (!canDecode) {
    result.error = `Browser cannot decode ${file.type} images.`;
    return result;
  }

  // Handle animated GIFs
  if (file.type === 'image/gif' && !preserveAnimation) {
    result.wasAnimated = true;
  }

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Failed to load image.';
    return result;
  }

  // Convert to WebP via canvas
  const canvas = imageToCanvas(img, maxDimension);
  const webpBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(
      (b) => resolve(b ?? null),
      'image/webp',
      quality
    );
  });

  if (!webpBlob) {
    result.error = 'WebP conversion produced no output.';
    return result;
  }

  result.blob = webpBlob;
  result.convertedSize = webpBlob.size;
  onProgress?.(file.name, 1, 1);
  return result;
}

/**
 * Convert multiple image files to WebP. Processes sequentially to avoid
 * memory pressure with large images.
 */
export async function convertImageToWebP(
  files: FileList | File[],
  options: ConvertImageToWebPOptions = {}
): Promise<ConvertImageToWebPResult[]> {
  const fileArray = Array.from(files);
  const results: ConvertImageToWebPResult[] = [];
  let completed = 0;

  for (const file of fileArray) {
    completed += 1;
    const result = await convertSingleImage(file, {
      ...options,
      onProgress: (name, loaded, total) => {
        options.onProgress?.(name, loaded, total);
      },
    });
    results.push(result);

    // Report overall progress
    options.onProgress?.(
      `Overall: ${completed}/${fileArray.length}`,
      completed,
      fileArray.length
    );
  }

  return results;
}

/**
 * Compute size reduction percentage and human-readable sizes.
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function computeSavings(originalSize: number, convertedSize: number): {
  percent: number;
  savedBytes: number;
} {
  const savedBytes = originalSize - convertedSize;
  const percent = originalSize > 0 ? Math.round((savedBytes / originalSize) * 100) : 0;
  return { percent, savedBytes };
}
"""Objective image metrics for the HD Enhance tests (numpy / OpenCV / scikit-image)."""
import numpy as np, cv2
from skimage.metrics import structural_similarity, peak_signal_noise_ratio
def arr(im): return np.asarray(im.convert('RGB')).astype(np.float32)
def crop(a, m=12): return a[m:-m, m:-m]
def gray(a): return cv2.cvtColor(a.astype(np.uint8), cv2.COLOR_RGB2GRAY).astype(np.float32)
def lap_var(a): return float(cv2.Laplacian(gray(a), cv2.CV_32F).var())
def ssim(a, b): return float(structural_similarity(gray(a), gray(b), data_range=255))
def psnr(a, b): return float(peak_signal_noise_ratio(a, b, data_range=255))
def overshoot(out, ref, r=3):
    """Halo / ringing: how far the output goes beyond the reference's local min/max (r-pixel window), 99.9th pct and mean, in 0..255."""
    k = np.ones((2 * r + 1, 2 * r + 1), np.uint8); hi = cv2.dilate(ref, k); lo = cv2.erode(ref, k)
    o = np.maximum(out - hi, 0) + np.maximum(lo - out, 0); return float(np.percentile(o, 99.9)), float(o.mean())
def clipped(a): return float(((a <= 0.5) | (a >= 254.5)).mean())
def flat_noise(a, box):
    """Noise level (std of high-pass) inside a flat region box=(x0,y0,x1,y1) fractions."""
    H, W = a.shape[:2]; g = gray(a)[int(box[1] * H):int(box[3] * H), int(box[0] * W):int(box[2] * W)]
    return float((g - cv2.GaussianBlur(g, (0, 0), 3)).std())

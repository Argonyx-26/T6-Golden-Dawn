import io

import numpy as np
import torch
from PIL import Image
from torchvision import transforms

MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)


class WhiteBalance(torch.nn.Module):
    """Mild per-channel gain (white-balance drift) on a 0..1 float tensor.

    Applied per-sample draw: each RGB channel scaled by a factor drawn from
    U(1-shift, 1+shift). Kept mild because colour is diagnostic here.
    """

    def __init__(self, shift=0.1):
        super().__init__()
        self.shift = float(shift)

    def forward(self, x):
        if not self.training:
            return x
        g = torch.empty(3).uniform_(1 - self.shift, 1 + self.shift).view(3, 1, 1)
        return (x * g).clamp(0, 1)


class AddGaussianNoise(torch.nn.Module):
    """Mild sensor noise on a 0..1 float tensor."""

    def __init__(self, sigma=0.02):
        super().__init__()
        self.sigma = float(sigma)

    def forward(self, x):
        if not self.training:
            return x
        return (x + torch.randn_like(x) * self.sigma).clamp(0, 1)


class JpegCompress(torch.nn.Module):
    """Random JPEG re-compression (phone/cloud upload artifacts)."""

    def __init__(self, q_lo=45, q_hi=92):
        super().__init__()
        self.q_lo, self.q_hi = int(q_lo), int(q_hi)

    def forward(self, img):
        if not self.training:
            return img
        q = int(torch.randint(self.q_lo, self.q_hi, (1,)).item())
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=q)
        buf.seek(0)
        return Image.open(buf).convert("RGB")


def build_train_aug(size=224):
    """On-the-fly train augmentation (train only; eval uses CONTRACT_TF).

    Geometric: rotation +/-25deg, perspective, random resized crop 0.6-1.0,
    horizontal flip, small shear. Photometric: brightness/contrast/saturation,
    white-balance drift, JPEG compression, mild gaussian blur + noise.
    Hue jitter is kept near-zero (colour is diagnostic).
    """
    return transforms.Compose(
        [
            transforms.RandomAffine(
                degrees=25, translate=(0.05, 0.05), scale=(0.9, 1.1), shear=8
            ),
            transforms.RandomPerspective(distortion_scale=0.15, p=0.5),
            transforms.RandomResizedCrop(size, scale=(0.6, 1.0), ratio=(0.9, 1.1)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.ColorJitter(
                brightness=0.2, contrast=0.2, saturation=0.15, hue=0.02
            ),
            transforms.RandomApply([JpegCompress()], p=0.5),
            transforms.RandomApply([transforms.GaussianBlur(3, (0.1, 1.5))], p=0.3),
            transforms.ToTensor(),
            transforms.RandomApply([AddGaussianNoise(0.02)], p=0.3),
            WhiteBalance(0.1),
            transforms.Normalize(MEAN, STD),
        ]
    )


def build_eval_tf(size=224):
    """EXACT contract transform (must match CONTRACT.md / browser)."""
    return transforms.Compose(
        [
            transforms.Resize((size, size)),
            transforms.ToTensor(),
            transforms.Normalize(MEAN, STD),
        ]
    )


def np_to_pil(x):
    x = (x.clamp(0, 1).permute(1, 2, 0).numpy() * 255).astype(np.uint8)
    return Image.fromarray(x)


def deaug_tensor(x):
    """Reverse a single-sample normalized tensor back to 0..1 RGB for display."""
    t = x.clone()
    for c in range(3):
        t[c] = t[c] * STD[c] + MEAN[c]
    return t.clamp(0, 1)


__all__ = [
    "WhiteBalance",
    "AddGaussianNoise",
    "JpegCompress",
    "build_train_aug",
    "build_eval_tf",
    "deaug_tensor",
    "np_to_pil",
]
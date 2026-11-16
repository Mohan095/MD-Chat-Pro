import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, Download } from 'lucide-react';

export default function ImageLightbox({ image, onClose }) {
  const [zoom, setZoom] = useState(1);

  if (!image) return null;

  const handleZoomIn = (e) => {
    e.stopPropagation();
    setZoom((z) => Math.min(z + 0.35, 2.8));
  };

  const handleZoomOut = (e) => {
    e.stopPropagation();
    setZoom((z) => Math.max(z - 0.35, 0.6));
  };

  return (
    <div className="lightbox-backdrop" onClick={onClose}>
      <div className="lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
        <span className="lightbox-filename">{image.name || 'Shared Image'}</span>
        <div className="lightbox-actions">
          <button
            type="button"
            className="icon-btn"
            onClick={handleZoomOut}
            title="Zoom out"
          >
            <ZoomOut size={18} />
          </button>
          <button
            type="button"
            className="icon-btn"
            onClick={handleZoomIn}
            title="Zoom in"
          >
            <ZoomIn size={18} />
          </button>
          <a
            href={image.url}
            download={image.name || 'mdchat-image.png'}
            className="icon-btn"
            title="Download image"
            onClick={(e) => e.stopPropagation()}
          >
            <Download size={18} />
          </a>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            title="Close preview"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="lightbox-stage">
        <img
          src={image.url}
          alt={image.name || 'Preview'}
          className="lightbox-image"
          style={{ transform: `scale(${zoom})` }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    </div>
  );
}

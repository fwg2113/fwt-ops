'use client';

import { useRef, useEffect, useState, useCallback } from 'react';

// ============================================================================
// SIGNATURE PAD
// Canvas-based signature capture — works on touch, mouse, and stylus
// Returns base64 PNG data URL via onChange
// ============================================================================

interface Props {
  width?: number;
  height?: number;
  label?: string;
  penColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  value?: string | null;
  onChange?: (dataUrl: string | null) => void;
  disabled?: boolean;
}

export default function SignaturePad({
  width = 400,
  height = 150,
  label,
  penColor = '#1a1a1a',
  backgroundColor = '#ffffff',
  borderColor = '#d1d5db',
  value,
  onChange,
  disabled = false,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas resolution for sharp rendering
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    // Fill background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // If there's an existing value, draw it
    if (value) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, width, height);
        setHasDrawn(true);
      };
      img.src = value;
    }
  }, [width, height, backgroundColor, value]);

  const getPoint = useCallback((e: React.MouseEvent | React.TouchEvent): { x: number; y: number } => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, [width, height]);

  const startDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDrawing(true);
    lastPoint.current = getPoint(e);
  }, [disabled, getPoint]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return;
    e.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !lastPoint.current) return;

    const point = getPoint(e);

    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    lastPoint.current = point;
    setHasDrawn(true);
  }, [isDrawing, disabled, getPoint, penColor]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);
    lastPoint.current = null;

    // Export the signature
    const canvas = canvasRef.current;
    if (canvas && hasDrawn) {
      onChange?.(canvas.toDataURL('image/png'));
    }
  }, [isDrawing, hasDrawn, onChange]);

  function handleClear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    setHasDrawn(false);
    lastPoint.current = null;
    onChange?.(null);
  }

  // Global mouseup/touchend
  useEffect(() => {
    function onEnd() { if (isDrawing) stopDrawing(); }
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isDrawing, stopDrawing]);

  return (
    <div>
      {label && (
        <div style={{
          fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280',
          textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6,
        }}>
          {label}
        </div>
      )}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          style={{
            border: `2px solid ${borderColor}`,
            borderRadius: 8,
            cursor: disabled ? 'default' : 'crosshair',
            touchAction: 'none',
            maxWidth: '100%',
          }}
        />
        {/* Signing line */}
        {!hasDrawn && !value && (
          <div style={{
            position: 'absolute', bottom: 30, left: 20, right: 20,
            borderBottom: '1px solid #d1d5db', pointerEvents: 'none',
          }}>
            <span style={{ position: 'absolute', right: 0, bottom: 4, fontSize: '0.6rem', color: '#9ca3af' }}>
              Sign here
            </span>
          </div>
        )}
        {/* Clear button */}
        {hasDrawn && !disabled && (
          <button
            onClick={handleClear}
            style={{
              position: 'absolute', top: 6, right: 6,
              background: 'rgba(0,0,0,0.5)', color: '#fff',
              border: 'none', borderRadius: 4,
              padding: '3px 8px', fontSize: '0.625rem', fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// INITIALS PAD — smaller version for capturing initials
// ============================================================================
export function InitialsPad({
  value,
  onChange,
  disabled,
  label = 'Initials',
}: {
  value?: string | null;
  onChange?: (dataUrl: string | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <SignaturePad
      width={120}
      height={60}
      label={label}
      value={value}
      onChange={onChange}
      disabled={disabled}
    />
  );
}

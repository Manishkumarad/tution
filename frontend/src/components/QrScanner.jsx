import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function QrScanner({ onScan }) {
  const containerId = 'qr-reader-box';
  const scannerRef = useRef(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active) return undefined;

    scannerRef.current = new Html5QrcodeScanner(
      containerId,
      { fps: 10, qrbox: { width: 220, height: 220 } },
      false
    );

    scannerRef.current.render(
      (decodedText) => {
        try {
          const parsed = JSON.parse(decodedText);
          if (parsed.qr_token) onScan(parsed.qr_token);
        } catch (_err) {
          // ignore invalid QR payloads
        }
      },
      () => {}
    );

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
      }
    };
  }, [active, onScan]);

  return (
    <div>
      <button className="btn" onClick={() => setActive((v) => !v)}>
        {active ? 'Stop Camera' : 'Start Camera Scan'}
      </button>
      <div id={containerId} className="scanner-zone" />
    </div>
  );
}

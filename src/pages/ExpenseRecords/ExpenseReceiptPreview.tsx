import { X } from "lucide-react";
import { createPortal } from "react-dom";

interface ExpenseReceiptPreviewProps {
  previewImage: string | null;
  onClose: () => void;
}

export default function ExpenseReceiptPreview({
  previewImage,
  onClose,
}: ExpenseReceiptPreviewProps) {
  if (!previewImage || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[3000] flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md transition-opacity duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Receipt Image Fullscreen Preview"
    >
      {/* Top Bar with Close (X) Button */}
      <div className="absolute top-4 right-4 z-[3010]">
        <button
          type="button"
          onClick={onClose}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white bg-white/15 hover:bg-white/25 active:scale-95 transition-all border border-white/20 cursor-pointer shadow-xl focus:outline-none"
          title="Close preview (Esc)"
          aria-label="Close"
        >
          <X size={22} />
        </button>
      </div>

      {/* Fullscreen Image Preview */}
      <div
        className="relative max-w-full max-h-[92vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={previewImage}
          alt="Receipt Preview"
          className="max-w-full max-h-[92vh] w-auto h-auto object-contain rounded-xl shadow-2xl border border-white/10 select-none"
        />
      </div>
    </div>,
    document.body,
  );
}

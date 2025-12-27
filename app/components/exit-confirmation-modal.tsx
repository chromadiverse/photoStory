import { AlertTriangle, X } from 'lucide-react'

interface ExitConfirmModalProps {
  isVisible: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ExitConfirmModal({ isVisible, onConfirm, onCancel }: ExitConfirmModalProps) {
  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl border border-gray-200 shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-6 pb-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-800">
              Exit Scanner?
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-full hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-700 leading-relaxed mb-2">
            Are you sure you want to exit? 
          </p>
          <p className="text-gray-600 text-sm leading-relaxed">
            You will lose all available scans and any unsaved progress. This action cannot be undone.
          </p>
        </div>

        {/* Footer */}
        <div className="flex space-x-3 p-6 pt-0">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
          >
            No, Continue Scanning
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
          >
            Yes, Exit
          </button>
        </div>
      </div>
    </div>
  )
}
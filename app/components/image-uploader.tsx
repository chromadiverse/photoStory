"use client";

import { useRef, useEffect } from "react";
import Uppy from "@uppy/core";
import XHRUpload from "@uppy/xhr-upload";
import { toast } from "sonner";

interface ImageUploaderProps {
  imageBlob: Blob;
  bucketName: string;
  folderName: string;
  onUploadComplete: (uploadedFile: {
    name: string;
    path: string;
    type: string;
  }) => void;
  onUploadError?: (error: Error) => void;
}

export default function ImageUploader({
  imageBlob,
  bucketName,
  folderName,
  onUploadComplete,
  onUploadError,
}: ImageUploaderProps) {
  const uppyRef = useRef<Uppy | null>(null);
  const onUploadCompleteRef = useRef(onUploadComplete);
  const onUploadErrorRef = useRef(onUploadError);

  useEffect(() => { onUploadCompleteRef.current = onUploadComplete; }, [onUploadComplete]);
  useEffect(() => { onUploadErrorRef.current = onUploadError; }, [onUploadError]);

  useEffect(() => {
    console.log('[ImageUploader] Mounted, starting upload...')
    console.log('[ImageUploader] bucketName:', bucketName)
    console.log('[ImageUploader] folderName:', folderName)
    console.log('[ImageUploader] imageBlob size:', imageBlob.size)

    // Skip Uppy entirely — direct fetch is simpler and works fine here
    const run = async () => {
      try {
        const file = new File([imageBlob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" })

        const formData = new FormData()
        formData.append("file", file)
        formData.append("bucketName", bucketName)
        formData.append("folderName", folderName)

        console.log('[ImageUploader] Sending POST to /api/upload-to-s3-via-api')

        const response = await fetch("/api/upload-to-s3-via-api", {
          method: "POST",
          body: formData,
        })

        const data = await response.json()
        console.log('[ImageUploader] Response status:', response.status)
        console.log('[ImageUploader] Response data:', data)

        if (!response.ok) {
          throw new Error(data.error || `Upload failed with status ${response.status}`)
        }

        if (!data.path) {
          throw new Error("No path in response")
        }

        onUploadCompleteRef.current({
          name: file.name,
          path: data.path,
          type: file.type,
        })

      } catch (error) {
        console.error('[ImageUploader] Upload failed:', error)
        toast.error('Upload failed: ' + (error as Error).message)
        onUploadErrorRef.current?.(error as Error)
      }
    }

    run()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null;
}
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
  
  // Keep callback refs fresh so Uppy's stale closure always calls
  // the latest version
  const onUploadCompleteRef = useRef(onUploadComplete);
  const onUploadErrorRef = useRef(onUploadError);
  
  useEffect(() => {
    onUploadCompleteRef.current = onUploadComplete;
  }, [onUploadComplete]);
  
  useEffect(() => {
    onUploadErrorRef.current = onUploadError;
  }, [onUploadError]);

  useEffect(() => {
    const uppy = new Uppy({
      id: `image-uploader-${Date.now()}`, // unique ID prevents conflicts on remount
      autoProceed: true,
      restrictions: {
        maxNumberOfFiles: 1,
        allowedFileTypes: ["image/*"],
      },
    });

  uppy.use(XHRUpload, {
  endpoint: "/api/upload-to-s3-via-api",
  method: "post",
  formData: true,
  fieldName: "file",
  allowedMetaFields: ["bucketName", "folderName"], // ← add this
  getResponseData: (xhr: XMLHttpRequest) => {
    try {
      if (xhr.response && typeof xhr.response === "object") return xhr.response;
      return JSON.parse(xhr.responseText);
    } catch {
      return {};
    }
  },
  getResponseError: (xhr: XMLHttpRequest) => {
    try {
      const data = JSON.parse(xhr.responseText);
      return new Error(data.error || `Upload failed with status ${xhr.status}`);
    } catch {
      return new Error(`Upload failed with status ${xhr.status}`);
    }
  },
} as any);
    uppy.on("complete", (result) => {
      toast.error(`DEBUG: Complete - ok:${result.successful?.length} fail:${result.failed?.length}`);
      
      if (result.successful && result.successful.length > 0) {
        const file = result.successful[0];
        const response = file.response?.body || {};
        toast.error(`DEBUG: Response: ${JSON.stringify(response)}`);
        
        if (response.path) {
          onUploadCompleteRef.current({
            name: file.name || `upload-${Date.now()}.jpg`,
            path: response.path,
            type: file.type || "image/jpeg",
          });
        } else {
          onUploadErrorRef.current?.(new Error("No path in response"));
        }
      } else if (result.failed && result.failed.length > 0) {
        const rawError = result.failed[0].error;
        const msg = typeof rawError === "string" 
          ? rawError 
          : (rawError as any)?.message || "Upload failed";
        toast.error(`DEBUG: Failed: ${msg}`);
        onUploadErrorRef.current?.(new Error(msg));
      }
    });

    uppy.on("error", (error) => {
      const msg = typeof error === "string" ? error : error?.message || "Unknown error";
      toast.error(`DEBUG: Error: ${msg}`);
      onUploadErrorRef.current?.(new Error(msg));
    });

    uppy.on("upload-error", (_file, error) => {
      const msg = typeof error === "string" ? error : error?.message || "Unknown upload error";
      toast.error(`DEBUG: Upload-error: ${msg}`);
      onUploadErrorRef.current?.(new Error(msg));
    });

    uppyRef.current = uppy;

    // Add file immediately on mount since this component only
    // renders when imageBlob + pendingMetadata are both set
    const file = new File([imageBlob], `photo-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });

   try {
  uppy.addFile({
    name: file.name,
    type: file.type,
    data: file,
    meta: { bucketName, folderName },
  });
  toast.error("DEBUG: File añadido, upload iniciando...");

  // TEMP: bypass Uppy, test API directly
  const testForm = new FormData()
  testForm.append("file", imageBlob, "test.jpg")
  testForm.append("bucketName", bucketName)
  testForm.append("folderName", folderName)
  
  fetch("/api/upload-to-s3-via-api", {
    method: "POST",
    body: testForm,
  })
    .then(r => r.json())
    .then(data => toast.error("FETCH TEST: " + JSON.stringify(data)))
    .catch(err => toast.error("FETCH TEST ERROR: " + err.message))

} catch (error)  {
      toast.error(`DEBUG: Error añadiendo file: ${error}`);
      onUploadErrorRef.current?.(error as Error);
    }

    return () => {
      uppy.destroy();
      uppyRef.current = null;
    };
  // Only run once on mount — callbacks stay fresh via refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
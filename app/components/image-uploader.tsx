"use client";

import { useRef, useEffect } from "react";
import Uppy from "@uppy/core";
import type { UppyFile } from "@uppy/core";
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

  useEffect(() => {
    if (!uppyRef.current) {
      toast.error("DEBUG: Inicializando Uppy");
      
      uppyRef.current = new Uppy({
        id: "image-uploader-pwa",
        autoProceed: true,
        restrictions: {
          maxNumberOfFiles: 1,
          allowedFileTypes: ["image/*"],
        },
        debug: true,
      });

      uppyRef.current.use(XHRUpload, {
        endpoint: "/api/upload-to-s3-via-api",
        method: "post",
        formData: true,
        fieldName: "file",
        getResponseData: (xhr: XMLHttpRequest) => {
          try {
            if (xhr.response && typeof xhr.response === 'object') {
              return xhr.response;
            }
            const data = JSON.parse(xhr.responseText);
            return data;
          } catch (e) {
            toast.error("DEBUG: No se pudo parsear respuesta");
            return {};
          }
        },
        getResponseError: (xhr: XMLHttpRequest) => {
          const status = xhr.status;
          const responseText = xhr.responseText;
          toast.error(`DEBUG: Error HTTP ${status}`);
          try {
            const data = JSON.parse(responseText);
            return new Error(data.error || `Upload failed with status ${status}`);
          } catch (e) {
            return new Error(`Upload failed with status ${status}: ${responseText}`);
          }
        },
      } as any);

      uppyRef.current.on("progress", (progress: number) => {
        toast.error(`DEBUG: Subiendo... ${Math.round(progress)}%`);
      });

      uppyRef.current.on("complete", (result) => {
        toast.error(`DEBUG: Complete - successful: ${result.successful?.length || 0}, failed: ${result.failed?.length || 0}`);

        if (result.successful && result.successful.length > 0) {
          const file = result.successful[0];
          const response = file.response?.body || {};
          
          toast.error(`DEBUG: Response recibida: ${JSON.stringify(response)}`);

          if (response.path) {
            toast.success("DEBUG: Upload exitoso!");
            onUploadComplete({
              name: file.name || `upload-${Date.now()}.jpg`,
              path: response.path,
              type: file.type || "image/jpeg",
            });
          } else {
            const errorMsg = "No path in response";
            toast.error(`DEBUG: ${errorMsg}`);
            onUploadError?.(new Error(errorMsg));
          }
        } else {
          if (result.failed && result.failed.length > 0) {
            const rawError = result.failed[0].error;
            let errorMsg = "Upload failed";
            if (typeof rawError === 'string') {
              errorMsg = rawError;
            } else if (rawError && typeof rawError === 'object' && 'message' in rawError) {
              errorMsg = (rawError as any).message;
            }
            toast.error(`DEBUG: Upload falló: ${errorMsg}`);
            onUploadError?.(new Error(errorMsg));
          }
        }
      });

      uppyRef.current.on("error", (error) => {
        toast.error(`DEBUG: Error general: ${typeof error === 'string' ? error : error?.message || 'Unknown'}`);
        if (typeof error === 'string') {
          onUploadError?.(new Error(error));
        } else if (error && typeof error === 'object' && 'message' in error) {
          onUploadError?.(error as Error);
        } else {
          onUploadError?.(new Error(`Unknown error: ${error}`));
        }
      });

      uppyRef.current.on("upload-error", (file, error, uploadResponse) => {
        const errorMsg = typeof error === 'string' ? error : error?.message || 'Unknown upload error';
        toast.error(`DEBUG: Upload error: ${errorMsg}`);
        onUploadError?.(new Error(errorMsg));
      });

      uppyRef.current.on("restriction-failed", (file, error) => {
        const errorMsg = typeof error === 'string' ? error : error?.message || 'Restriction failed';
        toast.error(`DEBUG: Restricción: ${errorMsg}`);
        onUploadError?.(new Error(errorMsg));
      });
    }

    return () => {
      if (uppyRef.current) {
        const files = uppyRef.current.getFiles();
        if (files.length > 0) {
          uppyRef.current.removeFiles(files.map((f) => f.id));
        }
      }
    };
  }, [bucketName, folderName, onUploadComplete, onUploadError]);

  useEffect(() => {
    if (uppyRef.current && imageBlob) {
      toast.error("DEBUG: Iniciando upload del blob");
      
      const existingFiles = uppyRef.current.getFiles();
      if (existingFiles.length > 0) {
        uppyRef.current.removeFiles(existingFiles.map((f) => f.id));
      }

      const file = new File([imageBlob], `photo-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });

      try {
        uppyRef.current.addFile({
          name: file.name,
          type: file.type,
          data: file,
          meta: { bucketName, folderName },
        });
        toast.error("DEBUG: File añadido a Uppy");
      } catch (error) {
        toast.error(`DEBUG: Error añadiendo file: ${error}`);
        onUploadError?.(error as Error);
      }
    }
  }, [imageBlob, bucketName, folderName, onUploadError]);

  return null;
}
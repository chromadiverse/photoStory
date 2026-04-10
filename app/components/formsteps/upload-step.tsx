import React from "react";
import { FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import FilesUppyUploader from "@/components/uppy/files-uploader-uppy";
import CloudflareStreamUploader from "@/components/cloudlflare/cloudflare-stream-uploader"; 
import SelectedGalleryFilePreview from "@/components/files/selected-gallery-file-preview";
import { UseFormReturn } from "react-hook-form";
import { FileInfo, GalleryMetadataFormData } from "@/types/gallery-metadata-schema";
import { env } from "@/config/env";
import { Button } from "@/components/ui/button";

interface UploadStepProps {
  form: UseFormReturn<GalleryMetadataFormData>;
  file: FileInfo | FileInfo[] | null;
  onUploadComplete: (files: FileInfo[]) => void;
  onContinue: () => void;
  mode: "create" | "edit";
  galleryId?: string;
  path: string;
}

export const UploadStep: React.FC<UploadStepProps> = ({
  form,
  file,
  onUploadComplete,
  mode,
  galleryId,
  onContinue,
  path,
}) => {
  // Get upload type from form to determine max files
  const uploadType = form.watch("uploadType");
  
  // Dynamic max files based on upload type
  const maxFiles = uploadType === "multiple" ? 20 : 1;
  
  // Track if we're in edit mode AND have a file, but still allow replacement
  const [isReplacingFile, setIsReplacingFile] = React.useState(false);

  const handleRemoveFile = (index?: number) => {
    if (uploadType === "single" || index === undefined) {
      // Remove all files in single mode or if no index specified
      form.resetField("file");
      onUploadComplete([]);
      setIsReplacingFile(true);
    } else {
      // Remove specific file in multiple mode
      const existingFiles = file ? (Array.isArray(file) ? file : [file]) : [];
      const updatedFiles = existingFiles.filter((_, i) => i !== index);
      onUploadComplete(updatedFiles);
    }
  };

  const handleNewUploadComplete = (newFiles: FileInfo[]) => {
   
    
    // Clear the "replacing" state when a new file is uploaded
    setIsReplacingFile(false);
    
    // Get existing files
    const existingFiles = file ? (Array.isArray(file) ? file : [file]) : [];

    
    // For single upload mode, replace existing file
    if (uploadType === "single") {
      onUploadComplete(newFiles);
    } 
    // For multiple upload mode, ADD to existing files (don't replace)
    else if (uploadType === "multiple") {
      // Merge existing files with new files
      const allFiles = [...existingFiles, ...newFiles];
    
      
      // Make sure we don't exceed max files
      const limitedFiles = allFiles.slice(0, maxFiles);
    
      
      onUploadComplete(limitedFiles);
    }
  };

  // Helper to get file array for display (handles both single file and array)
  const fileArray = file ? (Array.isArray(file) ? file : [file]) : [];

  // Disable uploader when max files reached in multiple mode
  const shouldDisableUploader = 
    uploadType === "single" 
      ? (mode === "create" ? file !== null : false) && !isReplacingFile
      : fileArray.length >= maxFiles; // Disable when max reached in multiple mode

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">
        {mode === "edit" ? "Replace Media Asset" : "Upload Media Asset"}
      </h2>
      
      {/* Show helpful message in edit mode */}
      {mode === "edit" && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            You can replace the current file by uploading a new one. 
            {file && " The existing file will be replaced."}
          </p>
        </div>
      )}

      {/* Show file count in multiple mode */}
      {uploadType === "multiple" && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-sm text-gray-700">
            Files uploaded: <span className="font-semibold">{fileArray.length}/{maxFiles}</span>
            {fileArray.length >= maxFiles && (
              <span className="text-orange-600 ml-2">(Maximum reached)</span>
            )}
          </p>
        </div>
      )}

      <FormField
        control={form.control}
        name="file"
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel className={fieldState.error ? "text-red-600 font-medium" : ""}>
              {mode === "edit" ? "New Photo/Video" : "Photos/Videos/Scrapbooks"} 
              <span className="text-red-500">*</span>
            </FormLabel>
            
            <section className="flex gap-2">
              <FilesUppyUploader
                bucketName={env.PUBLIC_IMAGE_GALLERY_BUCKET}
                documentType="file"
                onUploadComplete={handleNewUploadComplete}
                folderName=""
                maxNumberOfFiles={uploadType === "multiple" ? maxFiles - fileArray.length : 1}
                disabled={shouldDisableUploader}
                key={`files-${isReplacingFile ? "replacing" : "normal"}-${fileArray.length}`}
              />
              {/* REPLACED: VideoUppyUploader with CloudflareStreamUploader */}
              <CloudflareStreamUploader
                documentType="file"
                onUploadComplete={handleNewUploadComplete}
                maxNumberOfFiles={uploadType === "multiple" ? maxFiles - fileArray.length : 1}
                disabled={shouldDisableUploader}
                key={`video-${isReplacingFile ? "replacing" : "normal"}-${fileArray.length}`}
              />
            </section>

            {fileArray.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">
                  {mode === "edit" ? "Current File" : "Selected File"}
                  {fileArray.length > 1 ? 's' : ''} ({fileArray.length}):
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {fileArray.map((f, index) => (
                    <SelectedGalleryFilePreview
                      key={`${f.path}-${index}`}
                      remove={() => handleRemoveFile(index)}
                      filename={f.path}
                      fileType={f.type}
                      path={path}
                      recordId={mode === "edit" ? galleryId : undefined}
                    />
                  ))}
                </div>
                {uploadType === "multiple" && fileArray.length < maxFiles && (
                  <p className="text-sm text-green-600 mt-2">
                    ✓ You can upload {maxFiles - fileArray.length} more file{maxFiles - fileArray.length !== 1 ? 's' : ''}
                  </p>
                )}
                {mode === "edit" && (
                  <p className="text-sm text-gray-500 mt-2">
                    Click "Remove" to delete a file, then upload a new one
                  </p>
                )}
              </div>
            )}

            <FormMessage />
          </FormItem>
        )}
      />
      {fileArray.length > 0 && (
        <div className="flex justify-end pt-4">
          <Button
            type="button"
            onClick={onContinue}
          >
            Continue
          </Button>
        </div>
      )}
    </div>
  );
};
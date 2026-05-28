import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, AlertCircle } from "lucide-react";
import { ApiProject } from "@/types/api";

const swaggerSchema = z.object({
  projectId: z.string().min(1, "Please select a project"),
  swaggerContent: z.string().min(1, "Swagger content is required"),
});

type SwaggerFormData = z.infer<typeof swaggerSchema>;
type SwaggerSpec = Record<string, unknown>;

interface SwaggerUploaderProps {
  projects: ApiProject[];
  onUpload: (swaggerData: SwaggerSpec, projectId: string) => void;
  onCancel: () => void;
  isOpen?: boolean;
}

export const SwaggerUploader: React.FC<SwaggerUploaderProps> = ({
  projects,
  onUpload,
  onCancel,
  isOpen = true,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<SwaggerFormData>({
    resolver: zodResolver(swaggerSchema),
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        // Update the form field with the file content
        const textarea = document.getElementById("swaggerContent") as HTMLTextAreaElement;
        if (textarea) {
          textarea.value = content;
        }
      };
      reader.readAsText(file);
    }
  };

  const handleFormSubmit = async (data: SwaggerFormData) => {
    setIsUploading(true);
    setUploadError(null);

    try {
      // Parse the JSON content
      const swaggerData = JSON.parse(data.swaggerContent) as SwaggerSpec;
      
      // Validate that it's a valid OpenAPI spec
      if (!swaggerData.openapi && !swaggerData.swagger) {
        throw new Error("Invalid OpenAPI/Swagger specification");
      }

      await onUpload(swaggerData, data.projectId);
      reset();
    } catch (error) {
      setUploadError(
        error instanceof Error 
          ? error.message 
          : "Failed to parse Swagger specification"
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    reset();
    setUploadError(null);
    onCancel();
  };

  if (projects.length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={handleCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Swagger</DialogTitle>
            <DialogDescription>
              You need to create a project first before importing Swagger specifications.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={handleCancel}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Import Swagger/OpenAPI Specification</DialogTitle>
          <DialogDescription>
            Upload a Swagger or OpenAPI specification to automatically generate mock endpoints
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="projectId">Target Project</Label>
            <Select onValueChange={(value) => {
              // Update the form field
              const input = document.getElementById("projectId") as HTMLInputElement;
              if (input) input.value = value;
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name} ({project.basePath})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input
              id="projectId"
              type="hidden"
              {...register("projectId")}
            />
            {errors.projectId && (
              <p className="text-sm text-red-500">{errors.projectId.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="swaggerFile">Upload File</Label>
            <div className="flex items-center gap-2">
              <Input
                id="swaggerFile"
                type="file"
                accept=".json,.yaml,.yml"
                onChange={handleFileUpload}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm">
                <Upload className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Supported formats: JSON, YAML (.json, .yaml, .yml)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="swaggerContent">Or Paste Swagger Content</Label>
            <Textarea
              id="swaggerContent"
              {...register("swaggerContent")}
              placeholder="Paste your Swagger/OpenAPI specification here..."
              rows={10}
              className={errors.swaggerContent ? "border-red-500" : ""}
            />
            {errors.swaggerContent && (
              <p className="text-sm text-red-500">{errors.swaggerContent.message}</p>
            )}
          </div>

          {uploadError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <p className="text-sm text-red-700">{uploadError}</p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isUploading}>
              {isUploading ? "Importing..." : "Import Swagger"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

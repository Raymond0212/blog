import React from "react";
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
import { CreateProjectData } from "@/types/api";

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  basePath: z.string().min(1, "Base path is required").regex(/^\/[a-zA-Z0-9\/-]*$/, "Base path must start with / and contain only letters, numbers, hyphens, and slashes"),
});

interface ApiProjectFormProps {
  onSubmit: (data: CreateProjectData) => void;
  onCancel: () => void;
  initialData?: Partial<CreateProjectData>;
  isOpen?: boolean;
}

export const ApiProjectForm: React.FC<ApiProjectFormProps> = ({
  onSubmit,
  onCancel,
  initialData,
  isOpen = true,
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<CreateProjectData>({
    resolver: zodResolver(projectSchema),
    defaultValues: initialData,
  });

  const handleFormSubmit = async (data: CreateProjectData) => {
    try {
      await onSubmit(data);
      reset();
    } catch (error) {
      console.error("Failed to submit project:", error);
    }
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {initialData ? "Edit API Project" : "Create New API Project"}
          </DialogTitle>
          <DialogDescription>
            {initialData
              ? "Update your API project details"
              : "Create a new API project to organize your mock endpoints"}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name</Label>
            <Input
              id="name"
              {...register("name")}
              placeholder="My API Project"
              className={errors.name ? "border-red-500" : ""}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              {...register("description")}
              placeholder="Optional description of your API project"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="basePath">Base Path</Label>
            <Input
              id="basePath"
              {...register("basePath")}
              placeholder="/api/v1"
              className={errors.basePath ? "border-red-500" : ""}
            />
            {errors.basePath && (
              <p className="text-sm text-red-500">{errors.basePath.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              The base URL path for all endpoints in this project (e.g., /api/v1)
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : initialData ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

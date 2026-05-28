import React, { useEffect } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateEndpointData, Endpoint } from "@/types/api";
import { Badge } from "@/components/ui/badge";

const endpointSchema = z.object({
  name: z.string().min(1, "Endpoint name is required"),
  path: z.string().min(1, "Path is required").regex(/^\/[a-zA-Z0-9\/\-{}]*$/, "Path must start with / and contain only letters, numbers, hyphens, slashes, and path parameters"),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"]),
  description: z.string().optional(),
  contentType: z.string().optional(),
  statusCode: z.number().min(100).max(599).optional(),
  responseDelay: z.number().min(0).max(10000).optional(),
  schema: z.string().optional(),
  example: z.string().optional(),
});

type EndpointFormData = Omit<CreateEndpointData, 'schema'> & {
  schema?: string;
};

interface EndpointFormProps {
  onSubmit: (data: CreateEndpointData) => void;
  onCancel: () => void;
  initialData?: Endpoint;
  isOpen?: boolean;
}

export const EndpointForm: React.FC<EndpointFormProps> = ({
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
    watch,
    setValue,
  } = useForm<EndpointFormData>({
    resolver: zodResolver(endpointSchema),
    defaultValues: initialData ? {
      name: initialData.name,
      path: initialData.path,
      method: initialData.method,
      description: initialData.description,
      contentType: initialData.contentType,
      statusCode: initialData.statusCode,
      responseDelay: initialData.responseDelay,
      example: initialData.example,
    } : undefined,
  });

  const handleFormSubmit = async (data: EndpointFormData) => {
    try {
      // Parse schema if provided
      let parsedSchema: object | undefined;
      if (data.schema) {
        try {
          parsedSchema = JSON.parse(data.schema);
        } catch {
          throw new Error("Invalid JSON schema");
        }
      }

      const endpointData: CreateEndpointData = {
        name: data.name,
        path: data.path,
        method: data.method,
        description: data.description,
        contentType: data.contentType,
        statusCode: data.statusCode ? parseInt(data.statusCode.toString()) : undefined,
        responseDelay: data.responseDelay ? parseInt(data.responseDelay.toString()) : undefined,
        schema: parsedSchema,
        example: data.example,
      };

      await onSubmit(endpointData);
      reset();
    } catch (error) {
      console.error("Failed to submit endpoint:", error);
    }
  };

  // Set schema value when initialData changes
  useEffect(() => {
    if (initialData?.schema) {
      setValue("schema", JSON.stringify(initialData.schema, null, 2));
    }
  }, [initialData, setValue]);

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const getMethodColor = (method: string) => {
    const colors: Record<string, string> = {
      GET: "bg-green-100 text-green-800",
      POST: "bg-blue-100 text-blue-800",
      PUT: "bg-yellow-100 text-yellow-800",
      DELETE: "bg-red-100 text-red-800",
      PATCH: "bg-purple-100 text-purple-800",
    };
    return colors[method] || "bg-gray-100 text-gray-800";
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {initialData ? "Edit Endpoint" : "Create New Endpoint"}
          </DialogTitle>
          <DialogDescription>
            {initialData
              ? "Update your endpoint configuration"
              : "Create a new endpoint with custom response configuration"}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="response">Response</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Endpoint Name</Label>
                  <Input
                    id="name"
                    {...register("name")}
                    placeholder="Get Users"
                    className={errors.name ? "border-red-500" : ""}
                  />
                  {errors.name && (
                    <p className="text-sm text-red-500">{errors.name.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="method">HTTP Method</Label>
                  <Select
                    onValueChange={(value) =>
                      setValue("method", value as Endpoint["method"])
                    }
                    defaultValue={watch("method")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      {["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"].map((method) => (
                        <SelectItem key={method} value={method}>
                          <div className="flex items-center gap-2">
                            <Badge className={`text-xs ${getMethodColor(method)}`}>
                              {method}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="path">Path</Label>
                <Input
                  id="path"
                  {...register("path")}
                  placeholder="/users/{id}"
                  className={errors.path ? "border-red-500" : ""}
                />
                {errors.path && (
                  <p className="text-sm text-red-500">{errors.path.message}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Use curly braces for path parameters: /users/{'{id}'}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  {...register("description")}
                  placeholder="Optional description of this endpoint"
                  rows={3}
                />
              </div>
            </TabsContent>

            <TabsContent value="response" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="statusCode">Status Code</Label>
                  <Input
                    id="statusCode"
                    type="number"
                    {...register("statusCode")}
                    placeholder="200"
                    min="100"
                    max="599"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contentType">Content Type</Label>
                  <Select
                    onValueChange={(value) => setValue("contentType", value)}
                    defaultValue={watch("contentType")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select content type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="application/json">application/json</SelectItem>
                      <SelectItem value="text/plain">text/plain</SelectItem>
                      <SelectItem value="text/html">text/html</SelectItem>
                      <SelectItem value="application/xml">application/xml</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="responseDelay">Response Delay (ms)</Label>
                <Input
                  id="responseDelay"
                  type="number"
                  {...register("responseDelay")}
                  placeholder="0"
                  min="0"
                  max="10000"
                />
                <p className="text-xs text-muted-foreground">
                  Simulate network latency (0-10000ms)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="example">Example Response</Label>
                <Textarea
                  id="example"
                  {...register("example")}
                  placeholder='{"message": "Hello World"}'
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Static response or template (will override schema-based generation)
                </p>
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="schema">JSON Schema</Label>
                <Textarea
                  id="schema"
                  {...register("schema")}
                  placeholder={`{
  "type": "object",
  "properties": {
    "id": { "type": "number" },
    "name": { "type": "string" },
    "email": { "type": "string", "format": "email" }
  }
}`}
                  rows={8}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  JSON Schema for generating dynamic mock responses
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : initialData ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

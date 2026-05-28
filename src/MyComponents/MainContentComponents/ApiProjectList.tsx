import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { ApiProject } from "@/types/api";

interface ApiProjectListProps {
  projects: ApiProject[];
  onSelectProject: (project: ApiProject) => void;
  onDeleteProject: (projectId: string) => void;
}

export const ApiProjectList: React.FC<ApiProjectListProps> = ({
  projects,
  onSelectProject,
  onDeleteProject,
}) => {
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

  if (projects.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <div className="text-center space-y-4">
            <div className="text-6xl">📁</div>
            <h3 className="text-lg font-semibold">No API Projects</h3>
            <p className="text-muted-foreground">
              Create your first API project to get started with mocking
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((project) => (
        <Card
          key={project.id}
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => onSelectProject(project)}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-lg">{project.name}</CardTitle>
                <CardDescription className="mt-1">
                  {project.description || "No description"}
                </CardDescription>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteProject(project.id);
                  }}
                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="pt-0">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {project.basePath}
                </Badge>
                <Badge
                  variant={project.isActive ? "default" : "secondary"}
                  className="text-xs"
                >
                  {project.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{project.endpoints.length} endpoints</span>
                <span>
                  {new Date(project.updatedAt).toLocaleDateString()}
                </span>
              </div>
              
              {project.endpoints.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {project.endpoints.slice(0, 3).map((endpoint) => (
                    <Badge
                      key={endpoint.id}
                      variant="outline"
                      className={`text-xs ${getMethodColor(endpoint.method)}`}
                    >
                      {endpoint.method}
                    </Badge>
                  ))}
                  {project.endpoints.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{project.endpoints.length - 3} more
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

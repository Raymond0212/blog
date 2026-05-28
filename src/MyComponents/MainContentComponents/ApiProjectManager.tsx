import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Upload, Edit, Play, Square } from "lucide-react";
import { ApiProject } from "@/types/api";
import { ApiProjectList } from "@/MyComponents/MainContentComponents/ApiProjectList";
import { ApiProjectForm } from "@/MyComponents/MainContentComponents/ApiProjectForm";
import { SwaggerUploader } from "@/MyComponents/MainContentComponents/SwaggerUploader";
import { EndpointManager } from "@/MyComponents/MainContentComponents/EndpointManager";

const ApiProjectManager: React.FC = () => {
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<ApiProject | null>(null);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [isUploadingSwagger, setIsUploadingSwagger] = useState(false);

  useEffect(() => {
    // Load projects from backend
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const response = await fetch('/api/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Failed to load projects:', error);
    }
  };

  const handleCreateProject = async (projectData: Partial<ApiProject>) => {
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData),
      });
      
      if (response.ok) {
        const newProject = await response.json();
        setProjects([...projects, newProject]);
        setIsCreatingProject(false);
      }
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setProjects(projects.filter(p => p.id !== projectId));
        if (selectedProject?.id === projectId) {
          setSelectedProject(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const handleSwaggerUpload = async (
    swaggerData: Record<string, unknown>,
    projectId: string
  ) => {
    try {
      const response = await fetch('/api/upload-openapi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spec: swaggerData,
          projectId: projectId
        }),
      });
      
      if (response.ok) {
        await loadProjects(); // Reload to get updated endpoints
        setIsUploadingSwagger(false);
      }
    } catch (error) {
      console.error('Failed to upload Swagger:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">API Project Manager</h1>
          <p className="text-muted-foreground">
            Create and manage your mock API projects
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setIsCreatingProject(true)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            New Project
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsUploadingSwagger(true)}
            className="flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Import Swagger
          </Button>
        </div>
      </div>

      <Tabs value={selectedProject ? "project" : "overview"} className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {selectedProject && <TabsTrigger value="project">Project Details</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <ApiProjectList
            projects={projects}
            onSelectProject={setSelectedProject}
            onDeleteProject={handleDeleteProject}
          />
        </TabsContent>

        {selectedProject && (
          <TabsContent value="project" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">{selectedProject.name}</h2>
                <p className="text-muted-foreground">{selectedProject.description}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </Button>
                <Button variant="outline" size="sm">
                  <Play className="h-4 w-4 mr-2" />
                  Start
                </Button>
                <Button variant="outline" size="sm">
                  <Square className="h-4 w-4 mr-2" />
                  Stop
                </Button>
              </div>
            </div>
            
            <EndpointManager
              projectId={selectedProject.id}
              endpoints={selectedProject.endpoints}
              onEndpointsChange={(endpoints) => {
                setSelectedProject({ ...selectedProject, endpoints });
              }}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Modals */}
      {isCreatingProject && (
        <ApiProjectForm
          onSubmit={handleCreateProject}
          onCancel={() => setIsCreatingProject(false)}
        />
      )}

      {isUploadingSwagger && (
        <SwaggerUploader
          projects={projects}
          onUpload={handleSwaggerUpload}
          onCancel={() => setIsUploadingSwagger(false)}
        />
      )}
    </div>
  );
};

export default ApiProjectManager;

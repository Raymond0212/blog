import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Play, Square, Copy } from "lucide-react";
import { Endpoint, CreateEndpointData } from "@/types/api";
import { EndpointForm } from "@/MyComponents/MainContentComponents/EndpointForm";
import { EndpointDetails } from "@/MyComponents/MainContentComponents/EndpointDetails";

interface EndpointManagerProps {
  projectId: string;
  endpoints: Endpoint[];
  onEndpointsChange: (endpoints: Endpoint[]) => void;
}

export const EndpointManager: React.FC<EndpointManagerProps> = ({
  projectId,
  endpoints,
  onEndpointsChange,
}) => {
  const [isCreatingEndpoint, setIsCreatingEndpoint] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<Endpoint | null>(null);
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint | null>(null);

  const handleCreateEndpoint = async (endpointData: CreateEndpointData) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/endpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endpointData),
      });
      
      if (response.ok) {
        const newEndpoint = await response.json();
        onEndpointsChange([...endpoints, newEndpoint]);
        setIsCreatingEndpoint(false);
      }
    } catch (error) {
      console.error('Failed to create endpoint:', error);
    }
  };

  const handleUpdateEndpoint = async (endpointId: string, endpointData: Partial<CreateEndpointData>) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/endpoints/${endpointId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endpointData),
      });
      
      if (response.ok) {
        const updatedEndpoint = await response.json();
        onEndpointsChange(endpoints.map(e => e.id === endpointId ? updatedEndpoint : e));
        setEditingEndpoint(null);
      }
    } catch (error) {
      console.error('Failed to update endpoint:', error);
    }
  };

  const handleDeleteEndpoint = async (endpointId: string) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/endpoints/${endpointId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        onEndpointsChange(endpoints.filter(e => e.id !== endpointId));
        if (selectedEndpoint?.id === endpointId) {
          setSelectedEndpoint(null);
        }
      }
    } catch (error) {
      console.error('Failed to delete endpoint:', error);
    }
  };

  const handleToggleEndpoint = async (endpointId: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/endpoints/${endpointId}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      });
      
      if (response.ok) {
        onEndpointsChange(endpoints.map(e => 
          e.id === endpointId ? { ...e, isActive } : e
        ));
      }
    } catch (error) {
      console.error('Failed to toggle endpoint:', error);
    }
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

  const copyEndpointUrl = (endpoint: Endpoint) => {
    const url = `http://localhost:3000${endpoint.path}`;
    navigator.clipboard.writeText(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Endpoints</h3>
          <p className="text-sm text-muted-foreground">
            Manage your API endpoints and their responses
          </p>
        </div>
        <Button
          onClick={() => setIsCreatingEndpoint(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Endpoint
        </Button>
      </div>

      {endpoints.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="text-center space-y-4">
              <div className="text-4xl">🔗</div>
              <h3 className="text-lg font-semibold">No Endpoints</h3>
              <p className="text-muted-foreground">
                Create your first endpoint or import from Swagger
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Endpoints List */}
          <div className="space-y-3">
            <h4 className="font-medium">All Endpoints</h4>
            {endpoints.map((endpoint) => (
              <Card
                key={endpoint.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  selectedEndpoint?.id === endpoint.id ? 'ring-2 ring-primary' : ''
                }`}
                onClick={() => setSelectedEndpoint(endpoint)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge
                          variant="outline"
                          className={`text-xs ${getMethodColor(endpoint.method)}`}
                        >
                          {endpoint.method}
                        </Badge>
                        <Badge
                          variant={endpoint.isActive ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {endpoint.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <h5 className="font-medium text-sm">{endpoint.name}</h5>
                      <p className="text-xs text-muted-foreground font-mono">
                        {endpoint.path}
                      </p>
                      {endpoint.description && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {endpoint.description}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyEndpointUrl(endpoint);
                        }}
                        className="h-8 w-8 p-0"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleEndpoint(endpoint.id, !endpoint.isActive);
                        }}
                        className="h-8 w-8 p-0"
                      >
                        {endpoint.isActive ? (
                          <Square className="h-4 w-4 text-red-500" />
                        ) : (
                          <Play className="h-4 w-4 text-green-500" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingEndpoint(endpoint);
                        }}
                        className="h-8 w-8 p-0"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteEndpoint(endpoint.id);
                        }}
                        className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Endpoint Details */}
          {selectedEndpoint && (
            <div>
              <h4 className="font-medium mb-3">Endpoint Details</h4>
              <EndpointDetails endpoint={selectedEndpoint} />
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {isCreatingEndpoint && (
        <EndpointForm
          onSubmit={handleCreateEndpoint}
          onCancel={() => setIsCreatingEndpoint(false)}
        />
      )}

      {editingEndpoint && (
        <EndpointForm
          initialData={editingEndpoint}
          onSubmit={(data) => handleUpdateEndpoint(editingEndpoint.id, data)}
          onCancel={() => setEditingEndpoint(null)}
        />
      )}
    </div>
  );
};

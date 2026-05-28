import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, ExternalLink } from "lucide-react";
import { Endpoint } from "@/types/api";

interface EndpointDetailsProps {
  endpoint: Endpoint;
}

export const EndpointDetails: React.FC<EndpointDetailsProps> = ({ endpoint }) => {
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

  const copyEndpointUrl = () => {
    const url = `http://localhost:3000${endpoint.path}`;
    navigator.clipboard.writeText(url);
  };

  const testEndpoint = () => {
    const url = `http://localhost:3000${endpoint.path}`;
    window.open(url, '_blank');
  };

  const formatSchema = (schema: object) => {
    return JSON.stringify(schema, null, 2);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{endpoint.name}</CardTitle>
            <CardDescription className="mt-1">
              {endpoint.description || "No description"}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyEndpointUrl}
              className="flex items-center gap-2"
            >
              <Copy className="h-4 w-4" />
              Copy URL
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={testEndpoint}
              className="flex items-center gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Test
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="response">Response</TabsTrigger>
            <TabsTrigger value="parameters">Parameters</TabsTrigger>
            <TabsTrigger value="schema">Schema</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-sm mb-2">HTTP Method</h4>
                <Badge className={getMethodColor(endpoint.method)}>
                  {endpoint.method}
                </Badge>
              </div>
              <div>
                <h4 className="font-medium text-sm mb-2">Status</h4>
                <Badge variant={endpoint.isActive ? "default" : "secondary"}>
                  {endpoint.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-sm mb-2">Path</h4>
              <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                {endpoint.path}
              </code>
            </div>

            <div>
              <h4 className="font-medium text-sm mb-2">Full URL</h4>
              <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                http://localhost:3000{endpoint.path}
              </code>
            </div>

            {endpoint.responseDelay && (
              <div>
                <h4 className="font-medium text-sm mb-2">Response Delay</h4>
                <p className="text-sm text-muted-foreground">
                  {endpoint.responseDelay}ms
                </p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="response" className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-sm mb-2">Status Code</h4>
                <Badge variant="outline">
                  {endpoint.statusCode || 200}
                </Badge>
              </div>
              <div>
                <h4 className="font-medium text-sm mb-2">Content Type</h4>
                <Badge variant="outline">
                  {endpoint.contentType || "application/json"}
                </Badge>
              </div>
            </div>

            {endpoint.example && (
              <div>
                <h4 className="font-medium text-sm mb-2">Example Response</h4>
                <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
                  <code>{endpoint.example}</code>
                </pre>
              </div>
            )}
          </TabsContent>

          <TabsContent value="parameters" className="space-y-4">
            {(endpoint.queryParameters && endpoint.queryParameters.length > 0) && (
              <div>
                <h4 className="font-medium text-sm mb-2">Query Parameters</h4>
                <div className="space-y-2">
                  {endpoint.queryParameters.map((param, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                      <div>
                        <span className="font-mono text-sm">{param.name}</span>
                        {param.required && <Badge variant="destructive" className="ml-2 text-xs">Required</Badge>}
                      </div>
                      <span className="text-sm text-muted-foreground">{param.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(endpoint.routeParameters && endpoint.routeParameters.length > 0) && (
              <div>
                <h4 className="font-medium text-sm mb-2">Route Parameters</h4>
                <div className="space-y-2">
                  {endpoint.routeParameters.map((param, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                      <div>
                        <span className="font-mono text-sm">{param.name}</span>
                        {param.required && <Badge variant="destructive" className="ml-2 text-xs">Required</Badge>}
                      </div>
                      <span className="text-sm text-muted-foreground">{param.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(!endpoint.queryParameters || endpoint.queryParameters.length === 0) &&
             (!endpoint.routeParameters || endpoint.routeParameters.length === 0) && (
              <div className="text-center py-8 text-muted-foreground">
                <p>No parameters defined for this endpoint</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="schema" className="space-y-4">
            {endpoint.schema ? (
              <div>
                <h4 className="font-medium text-sm mb-2">JSON Schema</h4>
                <pre className="bg-muted p-3 rounded text-sm overflow-x-auto max-h-96">
                  <code>{formatSchema(endpoint.schema)}</code>
                </pre>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No schema defined for this endpoint</p>
                <p className="text-xs mt-1">Add a JSON schema to generate dynamic responses</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

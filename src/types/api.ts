export interface ApiProject {
  id: string;
  name: string;
  description?: string;
  basePath: string;
  endpoints: Endpoint[];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface Endpoint {
  id: string;
  name: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
  description?: string;
  contentType?: string;
  queryParameters?: Parameter[];
  routeParameters?: Parameter[];
  schema?: object;
  example?: string;
  responseDelay?: number;
  statusCode?: number;
  isActive: boolean;
}

export interface Parameter {
  name: string;
  value: string;
  description?: string;
  required?: boolean;
  type?: string;
}

export interface SwaggerUploadData {
  spec: object;
  projectId: string;
}

export interface CreateProjectData {
  name: string;
  description?: string;
  basePath: string;
}

export interface UpdateProjectData extends Partial<CreateProjectData> {
  id: string;
}

export interface CreateEndpointData {
  name: string;
  path: string;
  method: Endpoint['method'];
  description?: string;
  contentType?: string;
  schema?: object;
  example?: string;
  responseDelay?: number;
  statusCode?: number;
}

export interface UpdateEndpointData extends Partial<CreateEndpointData> {
  id: string;
}

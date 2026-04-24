{{/*
Expand the name of the chart.
*/}}
{{- define "agentops-console.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "agentops-console.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "agentops-console.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "agentops-console.labels" -}}
helm.sh/chart: {{ include "agentops-console.chart" . }}
{{ include "agentops-console.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "agentops-console.selectorLabels" -}}
app.kubernetes.io/name: {{ include "agentops-console.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "agentops-console.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "agentops-console.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Console RBAC rules — shared between ClusterRole and namespaced Roles.
*/}}
{{- define "agentops-console.rbacRules" -}}
# AgentOps CRDs
- apiGroups:
    - "agents.agentops.io"
  resources:
    - agents
    - agentruns
    - channels
    - agenttools
    - agentresources
  verbs:
    - get
    - list
    - watch
    - patch
# Native Kubernetes resources the console browses
- apiGroups:
    - ""
  resources:
    - pods
    - services
    - configmaps
    - secrets
    - events
    - namespaces
  verbs:
    - get
    - list
    - watch
- apiGroups:
    - "apps"
  resources:
    - deployments
    - statefulsets
    - daemonsets
  verbs:
    - get
    - list
    - watch
- apiGroups:
    - "batch"
  resources:
    - jobs
    - cronjobs
  verbs:
    - get
    - list
    - watch
- apiGroups:
    - "networking.k8s.io"
  resources:
    - ingresses
  verbs:
    - get
    - list
    - watch
{{- with .Values.rbac.extraRules }}
{{- toYaml . | nindent 0 }}
{{- end }}
{{- end }}

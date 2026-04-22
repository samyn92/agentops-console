# AgentOps Platform Agents

This document describes the AI agents that make up the AgentOps platform development team, their responsibilities, and how they collaborate.

---

## Platform Overview

The AgentOps platform is a self-developing, AI-native agent operations system built on Kubernetes. It consists of multiple microservices working together to provide a complete agent management solution.

### Architecture Components

| Component | Repository | Description |
|-----------|------------|-------------|
| **Core Operator** | [agentops-core](https://github.com/samyn92/agentops-core) | Kubernetes operator with CRDs and controllers for agent lifecycle management |
| **Console** | [agentops-console](https://github.com/samyn92/agentops-console) | Web console — Go BFF + SolidJS PWA with FEP/SSE streaming |
| **Runtime** | [agentops-runtime](https://github.com/samyn92/agentops-runtime) | Fantasy SDK agent runtime — Go binary powering agent pods |
| **Memory** | [agentops-memory](https://github.com/samyn92/agentops-memory) | Memory service with SQLite + FTS5 BM25 relevance-ranked context injection |
| **Platform** | [agentops-platform](https://github.com/samyn92/agentops-platform) | Umbrella Helm chart for complete platform deployment |
| **Tools** | [agent-tools](https://github.com/samyn92/agent-tools) | MCP tool servers (kubectl, kube-explore, flux, git, github, gitlab) |

### Console-Specific Architecture

The AgentOps Console is built with:
- **Backend**: Go-based BFF (Backend for Frontend) API
- **Frontend**: SolidJS Progressive Web App (PWA)
- **Streaming**: FEP (Flow-based Event Processing) with SSE (Server-Sent Events)
- **Features**: Real-time agent management, monitoring, and operations UI

---

## Task Agents

Task agents are specialized AI agents that execute specific development, testing, and operational tasks. They are triggered on-demand to perform work across the platform repositories.

### Available Task Agents

#### 1. Architect

**Specialty**: Solution design and technical architecture

**Responsibilities**:
- Design solutions before code is written
- Analyze existing codebase patterns
- Define technical approaches and system design
- Review architecture decisions

**Repository Access**:
- `agentops-core-repo` — CRDs, controllers, resource management
- `agentops-console-repo` — Go BFF + SolidJS PWA
- `agentops-runtime-repo` — Agent runtime binary
- `agentops-memory-repo` — Memory service
- `agentops-platform-repo` — Helm charts
- `agent-tools-repo` — MCP tool servers

**When to invoke**: Need high-level design, architecture review, or technical direction

---

#### 2. Coder (you are here!)

**Specialty**: Implementation and coding tasks

**Responsibilities**:
- Implement features and bug fixes
- Write and maintain documentation
- Create and modify configuration files
- Handle git operations (branching, committing, PRs)

**Repository Access**:
- All AgentOps repositories with read/write access

**When to invoke**: Ready-to-build implementation tasks, documentation needs

---

#### 3. CI Watcher

**Specialty**: Pipeline monitoring and CI/CD troubleshooting

**Responsibilities**:
- Monitor workflow/pipeline status across repos
- Investigate build failures
- Identify root causes of CI issues
- Suggest fixes for pipeline problems

**Repository Access**:
- All AgentOps repositories for workflow monitoring

**When to invoke**: CI failures, pipeline issues, build troubleshooting

---

#### 4. Cluster Healthcheck

**Specialty**: Kubernetes cluster monitoring

**Responsibilities**:
- Automated health monitoring for k3s homelab
- Check cluster resources (pods, PVCs, nodes, events)
- Generate health reports
- Identify potential issues

**Checklist**:
1. `kube_health` — Full cluster snapshot
2. Resource status verification
3. Problem identification and reporting

**When to invoke**: Scheduled health checks or cluster concerns

---

#### 5. Observability Engineer

**Specialty**: Distributed tracing analysis

**Responsibilities**:
- Analyze traces from Grafana Tempo
- Produce actionable improvement reports
- Identify performance bottlenecks
- Recommend optimizations

**When to invoke**: Performance issues, need for trace analysis

---

#### 6. PR Reviewer

**Specialty**: Code review and quality assurance

**Responsibilities**:
- Fetch and analyze PR diffs
- Review for correctness, security, and style
- Identify logic errors and edge cases
- Provide constructive feedback

**Review Checklist**:
- **Correctness**: Logic errors, edge cases, nil pointer risks
- **Security**: Input validation, injection risks, secrets handling
- **Style**: Go/TS idioms, naming, documentation

**Repository Access**:
- All AgentOps repositories

**When to invoke**: PR needs review before merge

---

#### 7. Tester

**Specialty**: Quality assurance and testing

**Responsibilities**:
- Build and validate changes
- Run test suites
- Catch bugs before production
- Verify feature completeness

**Repository Access**:
- All AgentOps repositories

**When to invoke**: Before releases, need comprehensive testing

---

## Daemon Agents

Daemon agents are continuously running agents that provide ongoing services and monitoring for the platform.

### Available Daemon Agents

#### 1. Platform Lead

**Purpose**: The CEO of the AgentOps self-developing factory

**Responsibilities**:
- Single orchestrator for all platform development
- Receives instructions and coordinates other agents
- Manages development priorities
- Ensures platform-wide consistency

**Status**: Running

**Repository Access**:
- All AgentOps repositories

**Interaction Model**: Delegates tasks to task agents and coordinates multi-agent workflows

---

#### 2. Homecluster Manager

**Purpose**: Kubernetes operations specialist for homelab cluster

**Responsibilities**:
- Manage k3s homelab infrastructure
- Flux GitOps operations
- Helm release management
- Infrastructure troubleshooting

**Tool Strategy**:
1. **kube-explore** — Cluster exploration
2. **flux** — GitOps operations
3. **kubectl** — Direct cluster operations

**Repository Access**:
- `homecluster-repo` (GitLab: samyn92/homecluster) — Flux, Helm, infrastructure

**Status**: Running

---

## Development Workflow

### How Agents Collaborate on the Console

The AgentOps Console development follows an agent-orchestrated workflow:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Platform Lead (Daemon)                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Task Delegation                              │
├─────────────────────────────────────────────────────────────────┤
│  1. Receive feature/bug request                                  │
│  2. Assess required agents (architect → coder → tester)          │
│  3. Delegate to appropriate task agents                          │
│  4. Coordinate multi-agent workflows                             │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   Architect  │ ───▶ │    Coder     │ ───▶ │   PR Review  │
│  (Design)    │      │ (Implement)  │      │  (Validate)  │
└──────────────┘      └──────────────┘      └──────────────┘
                              │
                              ▼
                       ┌──────────────┐
                       │    Tester    │
                       │   (Verify)   │
                       └──────────────┘
```

### Console Development Flow

1. **Design Phase** (`architect` agent)
   - Analyze console architecture
   - Design UI/UX changes
   - Define API contracts

2. **Implementation Phase** (`coder` agent - you!)
   - Clone `agentops-console-repo`
   - Create feature branch
   - Implement changes (Go BFF + SolidJS)
   - Commit and push

3. **Review Phase** (`pr-reviewer` agent)
   - Analyze PR diff
   - Check Go/TypeScript idioms
   - Validate FEP/SSE streaming logic
   - Approve or request changes

4. **Testing Phase** (`tester` agent)
   - Build and run tests
   - Validate PWA functionality
   - Check streaming endpoints

5. **CI Phase** (`ci-watcher` agent)
   - Monitor GitHub Actions
   - Report build status
   - Troubleshoot failures

### Repository Bindings Summary

| Agent | agentops-core | agentops-console | agentops-runtime | agentops-memory | agentops-platform | agent-tools | homecluster |
|-------|---------------|------------------|------------------|-----------------|-------------------|-------------|-------------|
| Architect | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Coder | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| CI Watcher | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Cluster Healthcheck | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Observability Engineer | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| PR Reviewer | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Tester | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Platform Lead | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Homecluster Manager | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

### Best Practices

1. **Agent Delegation**: Use `run_agent` to delegate to specialized agents
2. **Parallel Execution**: Use `run_agents` for fan-out tasks
3. **Memory**: Agents use persistent memory for context across sessions
4. **Git Resources**: Specify `git_resource` and `git_branch` for coding tasks
5. **Callbacks**: Results delivered automatically for parallel agent execution

---

## Getting Started

### For New Developers

1. **Understand the Console Stack**:
   - Go backend with FEP/SSE streaming
   - SolidJS frontend (PWA)
   - Kubernetes-native deployment

2. **Know Your Agents**:
   - Check this document for agent capabilities
   - Use `list_task_agents` to see available agents
   - Understand which agent to invoke for which task

3. **Console-Specific Guidelines**:
   - Backend API changes → Test streaming endpoints
   - Frontend changes → Verify PWA functionality
   - Both changes → Ensure FEP/SSE compatibility

4. **Common Workflows**:
   - Feature development: architect → coder → pr-reviewer → tester
   - Bug fixes: coder → pr-reviewer → tester
   - CI issues: ci-watcher → coder (fix)

---

## Contact & Resources

- **Console Repository**: https://github.com/samyn92/agentops-console
- **Platform Organization**: https://github.com/samyn92
- **Agent Commands**: Use `list_task_agents` to discover capabilities

---

*Last updated: Generated by Coder agent for AgentOps Platform documentation*
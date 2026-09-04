---
title: "eBPF + AI + Kubernetes: Real-Time Threat Detection for Cloud Native"
description: "A reference architecture combining eBPF for kernel-level observability with ML models to detect DDoS attacks, port scans, and anomalies in Kubernetes with low performance impact."
pubDate: 2026-09-05
updatedDate: 2026-09-05
image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1200&h=630&fit=crop"
tags: ["ebpf", "ai", "kubernetes", "security", "cloud-native", "observability"]
categories: ["kubernetes", "cloud-native", "ia"]
featured: true
lang: "en"
---

> **About this article**: What follows is a **reference design**, not the description of a finished product or of a system I have measured in production. I describe how the pieces (eBPF, an event pipeline, and an ML-based detection engine) would fit together, as a starting point for anyone who wants to build something similar on top of existing open source tools like Cilium, Tetragon or Falco. Where I mention figures, they are orders of magnitude published by the industry, not my own measurements.

## How to Detect Cyber Attacks in Real-Time Without Impacting Performance?

Imagine a system that can observe **every network packet** passing through your infrastructure, detect suspicious patterns like DDoS attacks or port scans, and alert you within seconds, all without noticeably degrading the performance of your nodes. That is what becomes possible when you combine **eBPF** (kernel-level observability) with **Machine Learning models** for analysis.

## The Problem to Solve

Traditional security systems face a dilemma:

- **Superficial monitoring**: Fast but misses critical details
- **Deep analysis**: Detects everything but slows down the system

The architecture I propose tries to break that trade-off by using eBPF to capture data at kernel speed, and ML models to detect both known threats and new anomalies.

## What is eBPF?

eBPF (Extended Berkeley Packet Filter) is a technology that allows running verified code inside the Linux kernel safely, without loading modules or recompiling. This means we can:

- Observe network traffic without copying every packet to user space
- Inspect system calls in real-time
- Trace process and container behavior
- Do so with low overhead, far lower than a sidecar or an agent capturing packets from userspace

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                        │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Node 1    │  │   Node 2    │  │   Node 3    │         │
│  │ ┌─────────┐ │  │ ┌─────────┐ │  │ ┌─────────┐ │         │
│  │ │eBPF Agt │ │  │ │eBPF Agt │ │  │ │eBPF Agt │ │         │
│  │ └────┬────┘ │  │ └────┬────┘ │  │ └────┬────┘ │         │
│  └──────┼──────┘  └──────┼──────┘  └──────┼──────┘         │
│         └────────────────┼────────────────┘                 │
│                          ▼                                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Collector & Aggregator                    │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │  │
│  │  │  Metrics    │  │  Events     │  │   Traces     │  │  │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘  │  │
│  └─────────┼────────────────┼────────────────┼──────────┘  │
│            └────────────────┼────────────────┘              │
│                             ▼                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                  ML Detection Engine                   │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐  │  │
│  │  │  Anomaly    │  │  Pattern    │  │   Threat     │  │  │
│  │  │  Detection  │  │  Matching   │  │   Scoring    │  │  │
│  │  └─────────────┘  └─────────────┘  └──────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
│                             ▼                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                    Alert Manager                       │  │
│  │  Slack │ PagerDuty │ Email │ Webhook                  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

The three components have clear responsibilities:

1. **eBPF agent (DaemonSet)**: eBPF programs attached to network tracepoints (XDP/TC) and syscall hooks. Its only job is to extract lightweight features (connection tuples, rates, TCP flags, syscalls per process) and push them through a ring buffer to user space. There is no ML here: everything that runs in the kernel must be trivially cheap.
2. **Collector & Aggregator**: receives events from all nodes, enriches them with Kubernetes metadata (pod, namespace, labels) and aggregates them into time windows. In practice this is a streaming pipeline (Kafka, NATS, or the Hubble/Tetragon exporter itself) plus a time-series store.
3. **ML Detection Engine**: consumes the aggregated windows and applies a hybrid approach of rules plus models. It runs outside the kernel and can scale independently.

## Threat Types Covered by the Design

### Network Attacks
- **DDoS**: Abnormal traffic volumes to specific services
- **Port Scanning**: Attempts to map open ports from a single source
- **SYN Floods**: TCP flood patterns (SYN without completed ACK)

### Anomalous Behavior
- **Lateral Movement**: Unusual communication between pods that normally do not talk to each other
- **Data Exfiltration**: Data transfers to external destinations outside the usual pattern
- **Privilege Escalation**: Changes in process permissions and capabilities

### Container Threats
- **Container Escape**: Attempts to break out of the container namespace
- **Crypto Mining**: Intensive CPU usage with connection patterns typical of mining pools
- **Rootkit Activity**: Syscalls associated with kernel manipulation

Several of these detections are already offered as rules by mature tools like Falco or Tetragon. The added value of ML is in the anomaly layer, where no known signature exists.

## Detection Engine: Hybrid Approach

The following pseudocode illustrates the logic; it is not an implementation:

```python
# Detection pipeline pseudocode
class ThreatDetector:
    def __init__(self):
        self.anomaly_model = IsolationForest()  # Anomaly detection
        self.classifier = RandomForest()         # Threat classification
        self.pattern_db = ThreatPatternDB()      # Known patterns (rules)

    def analyze(self, network_event):
        # 1. Check known patterns (fast, high confidence)
        if match := self.pattern_db.match(network_event):
            return Alert(type=match.threat_type, confidence=0.95)

        # 2. Detect anomalies (no prior signature)
        anomaly_score = self.anomaly_model.score(network_event)
        if anomaly_score > THRESHOLD:
            # 3. Classify threat type
            threat_type = self.classifier.predict(network_event)
            return Alert(type=threat_type, confidence=anomaly_score)

        return None
```

Why hybrid: rules give explainability and zero false positives on what you already know; the anomaly model covers what you do not know, at the cost of more false positives and less explainability. In a real SOC, most of the work is in calibrating that `THRESHOLD` and in training the model on normal traffic from **your** cluster, not on public datasets.

## Deploying the Agent on Kubernetes

An eBPF agent needs elevated privileges and access to the host kernel. The reference manifest would be:

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: ebpf-agent
  namespace: security-monitoring
spec:
  selector:
    matchLabels:
      app: ebpf-agent
  template:
    metadata:
      labels:
        app: ebpf-agent
    spec:
      hostNetwork: true
      hostPID: true
      containers:
      - name: agent
        image: registry.example.com/ebpf-security-agent:0.1.0
        securityContext:
          privileged: true
        volumeMounts:
        - name: sys
          mountPath: /sys
          readOnly: true
        - name: debug
          mountPath: /sys/kernel/debug
      volumes:
      - name: sys
        hostPath:
          path: /sys
      - name: debug
        hostPath:
          path: /sys/kernel/debug
```

On OpenShift this additionally means a dedicated `SecurityContextConstraints` (or `privileged`) and a ServiceAccount bound to that SCC. This is exactly what the Cilium, Tetragon and Falco operators do, and it is why this component must be treated as part of the platform, not as just another workload.

## Performance Considerations

I am not including a metrics table because I have not measured this design end to end, and any number I put there would be made up. What can be said based on what the ecosystem projects publish:

- **Kernel overhead**: well-written eBPF programs add a very low per-packet cost. Projects that run them in production (Cilium, Tetragon, Falco with its modern eBPF driver) commonly report CPU overheads in the low single-digit percent range under normal load. Treat that as an industry estimate and measure it in your own environment: it depends on how many hooks you enable and how much work you do per event.
- **Where the real cost goes**: not in the kernel, but in userspace. The collector, Kubernetes metadata enrichment, and above all model inference are what consume CPU and memory. That is why the design separates these components and moves them off the node where possible.
- **Detection latency**: determined by the aggregation window size, not by eBPF. Windows of seconds give fast detection but more noise; windows of minutes are more stable but arrive too late for a SYN flood.
- **Node memory**: eBPF maps have a fixed size reserved when the program is loaded. Size them according to the expected number of concurrent connections, not the theoretical maximum.

## Putting It Into Practice

If you want to build something like this, my recommendation is not to write the eBPF programs from scratch:

- **Cilium + Hubble** as the source of network events and L3/L4/L7 flows with Kubernetes identity already resolved
- **Tetragon** for process, syscall and in-container execution events
- **Falco** as the rules engine for the known-patterns layer, exporting to an event bus
- A consumer of your own for the anomaly layer, trained on your cluster's normal traffic
- **Grafana** for visualization and **Alertmanager** for alert routing

Natural extensions of the design would be automatic generation of `CiliumNetworkPolicy` from confirmed detections, and STIX export for correlation with external threat intelligence.

## Resources

- [eBPF Documentation](https://ebpf.io/)
- [Cilium - eBPF-based Networking](https://cilium.io/)
- [Falco - Runtime Security](https://falco.org/)
- [Tetragon - eBPF Security Observability](https://tetragon.cilium.io/)

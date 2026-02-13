---
title: "Ansible Execution Environment: Optimizing Automation with Containers"
description: "A practical guide to creating Ansible Execution Environments using ansible-builder and Red Hat UBI 9, solving the problem of inconsistent dependencies."
pubDate: 2025-06-21
image: "https://images.unsplash.com/photo-1605745341112-85968b19335b?w=1200&h=630&fit=crop"
tags: ["automation", "ansible", "containers", "aap", "execution-environment", "devops"]
categories: ["devops", "cloud-native"]
featured: false
lang: "en"
---

## The Story of a Common Problem

Imagine this situation: you've just written a perfect Ansible playbook on your local machine. It works beautifully. You test it over and over, and everything goes well. The moment comes to run it in production and... surprise! It fails because the server has a different Python version, is missing modules, or has incompatible dependencies.

If this sounds familiar, you're not alone. It's one of the most common headaches in the world of Ansible automation. And this is precisely the problem that **Ansible Execution Environment (EE)** comes to solve.

## What Exactly is an Execution Environment?

Think of an Execution Environment as a "space capsule" for your Ansible playbooks. It's a container that carries everything needed to run your automations: the correct Python version, all necessary modules, the Ansible collections you use, and any additional tools you require.

The big difference is that, while before you had to ensure each server had the correct environment configured (and keep it updated), now you simply run your container and you're done.

## Why Does This Change Everything?

### 1. Total Consistency Across Environments

No more "works on my machine." Your playbook will run exactly the same in development, staging, and production. The same Python version, the same libraries, the same results.

### 2. Collaboration Without Headaches

When you share an EE with your team, everyone works with the same environment. No more wasting hours configuring dependencies or resolving version conflicts.

### 3. Multiple Versions Without Conflicts

Does a legacy playbook need Python 2.7 while another requires Python 3.11? No problem. Each EE is independent and can have its own versions of everything.

### 4. Enterprise Ready

If your company uses or plans to use Ansible Automation Platform, EEs are the standard. They facilitate governance, compliance, and scalability of your automations.

## Getting Started: Creating Your First Execution Environment

Let's create an EE using the latest version of ansible-builder. This guide has been tested and works perfectly with Red Hat UBI 9.

### Step 1: Install the Necessary Tools

First, we need `ansible-builder`:

```bash
# Install the latest version of ansible-builder
pip install ansible-builder --upgrade

# Verify you have version 3.x
ansible-builder --version

# You'll also need Podman or Docker
# On Fedora/RHEL:
sudo dnf install podman

# On Ubuntu/Debian:
sudo apt install podman
```

### Step 2: Create the Project Structure

Let's create all the necessary files at once. Create a directory for your project:

```bash
mkdir my-ee-ubi9 && cd my-ee-ubi9
```

### Step 3: Create the Main execution-environment.yml File

This is the heart of your EE. Create the file with this content:

```yaml
version: 3

build_arg_defaults:
  ANSIBLE_GALAXY_CLI_COLLECTION_OPTS: '--pre'

dependencies:
  ansible_core:
    package_pip: ansible-core==2.14.4
  ansible_runner:
    package_pip: ansible-runner
  galaxy: requirements.yml
  python: requirements.txt
  system: bindep.txt
  exclude:
    python:
      - docker
    system:
      - python3-Cython

images:
  base_image:
    name: docker.io/redhat/ubi9:latest

additional_build_files:
  - src: files/ansible.cfg
    dest: configs

additional_build_steps:
  prepend_base:
    - RUN echo "Starting build process..."
    - RUN dnf install -y python3-pip
  prepend_galaxy:
    - COPY _build/configs/ansible.cfg /etc/ansible/ansible.cfg
  prepend_final: |
    RUN whoami
    RUN cat /etc/os-release
  append_final:
    - RUN echo "Build completed!"
    - RUN dnf clean all
    - RUN rm -rf /var/cache/dnf
```

### Step 4: Create System Dependencies (bindep.txt)

This file lists the operating system packages you need:

```
# Compilation
gcc [compile platform:rpm]
make [compile platform:rpm]

# Version control
git [platform:rpm]

# Network tools
iputils [platform:rpm]
net-tools [platform:rpm]
openssh-clients [platform:rpm]

# Python development
python3-devel [platform:rpm]
python3-cffi [platform:rpm]
python3-cryptography [platform:rpm]
python3-lxml [platform:rpm]
python3-pycparser [platform:rpm]

# SSH and connectivity
libssh-devel [platform:rpm]
sshpass [platform:rpm]

# Utilities
rsync [platform:rpm]
unzip [platform:rpm]
tar [platform:rpm]
```

### Step 5: Create Ansible Collections (requirements.yml)

Define which Ansible collections you need:

```yaml
---
collections:
  - name: ansible.posix
    version: ">=1.5.0"
  - name: community.general
    version: ">=7.0.0"
  - name: ansible.utils
    version: ">=2.9.0"
  - name: community.crypto
    version: ">=2.11.0"
```

### Step 6: Create Python Dependencies (requirements.txt)

List the necessary Python packages:

```
# Core
six>=1.16.0
psutil>=5.9.0

# Networking
paramiko>=2.12.0
netaddr>=0.8.0

# Utilities
jinja2>=3.1.0
PyYAML>=6.0
requests>=2.28.0
urllib3>=1.26.0
```

### Step 7: Create Ansible Configuration

First create the directory:

```bash
mkdir -p files
```

Then create `files/ansible.cfg`:

```ini
[defaults]
host_key_checking = False
retry_files_enabled = False
stdout_callback = yaml
interpreter_python = auto_silent
gathering = smart
fact_caching = jsonfile
fact_caching_connection = /tmp/ansible-facts
fact_caching_timeout = 3600

[ssh_connection]
pipelining = True
control_path = /tmp/ansible-ssh-%%h-%%p-%%r

[inventory]
enable_plugins = auto, yaml, ini, toml
```

### Step 8: Build Your Execution Environment

Now comes the moment of truth:

```bash
ansible-builder build -t my-ee:latest
```

The process will take a few minutes the first time. You'll see how:

- The UBI 9 base image is downloaded
- System packages are installed
- Python dependencies are configured
- Ansible collections are downloaded
- Custom configurations are applied

### Step 9: Verify and Use Your EE

**Verify it was built correctly:**

```bash
# See the created image
podman images | grep my-ee

# See which collections are installed
podman run --rm my-ee:latest ansible-galaxy collection list

# See the Ansible version
podman run --rm my-ee:latest ansible --version

# See which Python modules are installed
podman run --rm my-ee:latest pip list
```

**Use your EE to run playbooks:**

```bash
# Install ansible-navigator if you don't have it
pip install ansible-navigator

# Run a playbook
ansible-navigator run site.yml --execution-environment-image my-ee:latest
```

## Troubleshooting: Common Problems and Their Solutions

### "The build fails with package not found error"

This is the most common error when using UBI. Red Hat Universal Base Image has limited repositories by design.

**Quick solution**: Check which package fails and:

- Look for it with an alternative name
- Remove it from `bindep.txt` if it's not critical
- Install it from source in `additional_build_steps`

**Real example**: If `openshift-clients` is not available:

```yaml
additional_build_steps:
  prepend_base:
    - RUN curl -L https://mirror.openshift.com/pub/openshift-v4/clients/ocp/latest/openshift-client-linux.tar.gz | tar xz -C /usr/local/bin
```

### "My EE weighs more than 1GB"

EEs can inflate quickly, especially with multiple collections and dependencies.

**Optimization strategy**:

- Review what you really need - less is more
- Clean up after installing:

```yaml
additional_build_steps:
  append_final:
    - RUN dnf clean all && rm -rf /var/cache/dnf
    - RUN find /usr/local -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    - RUN find /usr/local -type f -name "*.pyc" -delete
    - RUN rm -rf /root/.cache /tmp/*
```

### "Permission denied when mounting volumes"

The classic SELinux problem on Red Hat systems.

**Solution**: Always use the `:Z` option when mounting:

```bash
# Correct
podman run -v $(pwd):/runner:Z my-ee:latest
```

## Best Practices

- **Version your EEs**: Use semantic tags like `v1.0.0`, not just `latest`
- **Document dependencies**: Comment why you include each package
- **Keep EEs specific**: Create different EEs for different purposes
- **Automate builds**: Integrate the build into your CI/CD
- **Test regularly**: Validate that your playbooks work with the EE

## Conclusion

Ansible Execution Environments represent a fundamental shift in how we handle dependencies and portability in Ansible. With this guide, you have everything you need to create robust and reproducible EEs based on Red Hat UBI 9.

The key is to start simple: create your first EE with minimal dependencies, test it, and add what you need. In no time, you'll wonder how you survived without them.

## Additional Resources

- [Official Ansible Builder Documentation](https://ansible-builder.readthedocs.io/en/latest/)
- [Ansible Navigator Documentation](https://ansible-navigator.readthedocs.io/)
- [Red Hat UBI Documentation](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/9/html/building_running_and_managing_containers/index)
- [EE Examples on GitHub](https://github.com/ansible/ansible-builder)

---

**Have you created your first Execution Environment?** What problems did you solve? What customizations did you add?

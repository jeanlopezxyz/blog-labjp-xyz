---
title: "Ansible Execution Environment: Optimizando la Automatización con Contenedores"
description: "Guía práctica para crear Ansible Execution Environments usando ansible-builder y Red Hat UBI 9, resolviendo el problema de dependencias inconsistentes."
pubDate: 2025-06-21
image: "https://images.unsplash.com/photo-1605745341112-85968b19335b?w=1200&h=630&fit=crop"
tags: ["automation", "ansible", "containers", "aap", "execution-environment", "devops"]
categories: ["devops", "cloud-native"]
featured: false
lang: "es"
---

## La historia de un problema común

Imagina esta situación: acabas de escribir un playbook de Ansible perfecto en tu máquina local. Funciona de maravilla. Lo pruebas una y otra vez, y todo sale bien. Llega el momento de ejecutarlo en producción y... ¡sorpresa! Falla porque el servidor tiene una versión diferente de Python, le faltan módulos o tiene dependencias incompatibles.

Si esto te suena familiar, no estás solo. Es uno de los dolores de cabeza más comunes en el mundo de la automatización con Ansible. Y es precisamente el problema que **Ansible Execution Environment (EE)** viene a resolver.

## ¿Qué es exactamente un Execution Environment?

Piensa en un Execution Environment como una "cápsula espacial" para tus playbooks de Ansible. Es un contenedor que lleva consigo todo lo necesario para ejecutar tus automatizaciones: la versión correcta de Python, todos los módulos necesarios, las colecciones de Ansible que usas, y cualquier herramienta adicional que requieras.

La gran diferencia es que, mientras antes tenías que asegurarte de que cada servidor tuviera el entorno correcto configurado (y mantenerlo actualizado), ahora simplemente ejecutas tu contenedor y listo.

## ¿Por qué esto cambia todo?

### 1. Consistencia total entre ambientes

Ya no más "funciona en mi máquina". Tu playbook se ejecutará exactamente igual en desarrollo, staging y producción. La misma versión de Python, las mismas librerías, los mismos resultados.

### 2. Colaboración sin dolores de cabeza

Cuando compartes un EE con tu equipo, todos trabajan con el mismo entorno. No más perder horas configurando dependencias o resolviendo conflictos de versiones.

### 3. Múltiples versiones sin conflictos

¿Un playbook legacy necesita Python 2.7 mientras que otro requiere Python 3.11? Sin problema. Cada EE es independiente y puede tener sus propias versiones de todo.

### 4. Preparado para el enterprise

Si tu empresa usa o planea usar Ansible Automation Platform, los EE son el estándar. Facilitan la gobernanza, el cumplimiento y la escalabilidad de tus automatizaciones.

## Manos a la obra: Creando tu primer Execution Environment

Vamos a crear un EE usando la versión más reciente de ansible-builder. Esta guía está probada y funciona perfectamente con Red Hat UBI 9.

### Paso 1: Instalar las herramientas necesarias

Primero necesitamos `ansible-builder`:

```bash
# Instalar la última versión de ansible-builder
pip install ansible-builder --upgrade

# Verificar que tienes la versión 3.x
ansible-builder --version

# También necesitarás Podman o Docker
# En Fedora/RHEL:
sudo dnf install podman

# En Ubuntu/Debian:
sudo apt install podman
```

### Paso 2: Crear la estructura del proyecto

Vamos a crear todos los archivos necesarios de una vez. Crea un directorio para tu proyecto:

```bash
mkdir mi-ee-ubi9 && cd mi-ee-ubi9
```

### Paso 3: Crear el archivo principal execution-environment.yml

Este es el corazón de tu EE. Crea el archivo con este contenido:

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

### Paso 4: Crear las dependencias del sistema (bindep.txt)

Este archivo lista los paquetes del sistema operativo que necesitas:

```
# Compilación
gcc [compile platform:rpm]
make [compile platform:rpm]

# Control de versiones
git [platform:rpm]

# Herramientas de red
iputils [platform:rpm]
net-tools [platform:rpm]
openssh-clients [platform:rpm]

# Desarrollo Python
python3-devel [platform:rpm]
python3-cffi [platform:rpm]
python3-cryptography [platform:rpm]
python3-lxml [platform:rpm]
python3-pycparser [platform:rpm]

# SSH y conectividad
libssh-devel [platform:rpm]
sshpass [platform:rpm]

# Utilidades
rsync [platform:rpm]
unzip [platform:rpm]
tar [platform:rpm]
```

### Paso 5: Crear las colecciones de Ansible (requirements.yml)

Define qué colecciones de Ansible necesitas:

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

### Paso 6: Crear las dependencias de Python (requirements.txt)

Lista los paquetes de Python necesarios:

```
# Core
six>=1.16.0
psutil>=5.9.0

# Networking
paramiko>=2.12.0
netaddr>=0.8.0

# Utilidades
jinja2>=3.1.0
PyYAML>=6.0
requests>=2.28.0
urllib3>=1.26.0
```

### Paso 7: Crear la configuración de Ansible

Primero crea el directorio:

```bash
mkdir -p files
```

Luego crea `files/ansible.cfg`:

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

### Paso 8: Construir tu Execution Environment

Ahora viene el momento de la verdad:

```bash
ansible-builder build -t mi-ee:latest
```

El proceso tomará algunos minutos la primera vez. Verás cómo:

- Se descarga la imagen base de UBI 9
- Se instalan los paquetes del sistema
- Se configuran las dependencias de Python
- Se descargan las colecciones de Ansible
- Se aplican las configuraciones personalizadas

### Paso 9: Verificar y usar tu EE

**Verificar que se construyó correctamente:**

```bash
# Ver la imagen creada
podman images | grep mi-ee

# Ver qué colecciones están instaladas
podman run --rm mi-ee:latest ansible-galaxy collection list

# Ver la versión de Ansible
podman run --rm mi-ee:latest ansible --version

# Ver qué módulos de Python están instalados
podman run --rm mi-ee:latest pip list
```

**Usar tu EE para ejecutar playbooks:**

```bash
# Instalar ansible-navigator si no lo tienes
pip install ansible-navigator

# Ejecutar un playbook
ansible-navigator run site.yml --execution-environment-image mi-ee:latest
```

## Troubleshooting: Problemas comunes y sus soluciones

### "El build falla con error de paquete no encontrado"

Este es el error más común al usar UBI. Red Hat Universal Base Image tiene repositorios limitados por diseño.

**Solución rápida**: Revisa qué paquete falla y:

- Búscalo con un nombre alternativo
- Elimínalo de `bindep.txt` si no es crítico
- Instálalo desde fuente en `additional_build_steps`

**Ejemplo real**: Si `openshift-clients` no está disponible:

```yaml
additional_build_steps:
  prepend_base:
    - RUN curl -L https://mirror.openshift.com/pub/openshift-v4/clients/ocp/latest/openshift-client-linux.tar.gz | tar xz -C /usr/local/bin
```

### "Mi EE pesa más de 1GB"

Los EEs pueden inflarse rápidamente, especialmente con múltiples colecciones y dependencias.

**Estrategia de optimización**:

- Revisa qué realmente necesitas - menos es más
- Limpia después de instalar:

```yaml
additional_build_steps:
  append_final:
    - RUN dnf clean all && rm -rf /var/cache/dnf
    - RUN find /usr/local -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    - RUN find /usr/local -type f -name "*.pyc" -delete
    - RUN rm -rf /root/.cache /tmp/*
```

### "Permission denied al montar volúmenes"

El clásico problema de SELinux en sistemas Red Hat.

**Solución**: Siempre usa la opción `:Z` al montar:

```bash
# Correcto
podman run -v $(pwd):/runner:Z mi-ee:latest
```

## Mejores prácticas

- **Versiona tus EEs**: Usa tags semánticos como `v1.0.0`, no solo `latest`
- **Documenta dependencias**: Comenta por qué incluyes cada paquete
- **Mantén EEs específicos**: Crea diferentes EEs para diferentes propósitos
- **Automatiza builds**: Integra la construcción en tu CI/CD
- **Prueba regularmente**: Valida que tus playbooks funcionan con el EE

## Conclusión

Los Ansible Execution Environments representan un cambio fundamental en cómo manejamos las dependencias y la portabilidad en Ansible. Con esta guía, tienes todo lo necesario para crear EEs robustos y reproducibles basados en Red Hat UBI 9.

La clave está en empezar simple: crea tu primer EE con las dependencias mínimas, pruébalo, y ve agregando lo que necesites. En poco tiempo, te preguntarás cómo sobrevivías sin ellos.

## Recursos adicionales

- [Documentación oficial de Ansible Builder](https://ansible-builder.readthedocs.io/en/latest/)
- [Ansible Navigator Documentation](https://ansible-navigator.readthedocs.io/)
- [Red Hat UBI Documentation](https://access.redhat.com/documentation/en-us/red_hat_enterprise_linux/9/html/building_running_and_managing_containers/index)
- [Ejemplos de EE en GitHub](https://github.com/ansible/ansible-builder)

---

**¿Ya creaste tu primer Execution Environment?** ¿Qué problemas resolviste? ¿Qué personalizaciones agregaste?

Y si este artículo te fue útil, compártelo con ese colega que siempre está peleando con las versiones de Python. 😉

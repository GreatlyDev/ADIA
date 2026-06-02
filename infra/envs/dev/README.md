# Dev Terraform Environment

This environment is safe in Phase 0. It wires placeholder modules only and does not create cloud resources.

Useful future commands:

```bash
terraform -chdir=infra/envs/dev init -backend=false
terraform -chdir=infra/envs/dev fmt
terraform -chdir=infra/envs/dev validate
```

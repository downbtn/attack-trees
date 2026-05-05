import uuid
from django.db import models


class Tree(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class Node(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tree = models.ForeignKey(Tree, on_delete=models.CASCADE, related_name="nodes")
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.CASCADE, related_name="children"
    )
    content = models.JSONField(default=dict)  # {label, color, shape, ...future keys}
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.tree.name} — {self.content.get('label', '')}"

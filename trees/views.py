import json
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST, require_http_methods

from .models import Node, Tree


def index(request):
    if request.method == "POST":
        label = request.POST.get("label", "").strip()
        if not label:
            return render(request, "trees/index.html", {"error": "Label is required."})
        tree = Tree.objects.create(name=label)
        Node.objects.create(
            tree=tree,
            parent=None,
            content={"label": label, "color": "#ffaaaa", "shape": "rect"},
        )
        return redirect("trees:detail", tree_id=tree.id)
    return render(request, "trees/index.html")


def tree_detail(request, tree_id):
    tree = get_object_or_404(Tree, id=tree_id)
    nodes = [
        {
            "id": str(node.id),
            "parent_id": str(node.parent_id) if node.parent_id else None,
            "content": node.content,
        }
        for node in tree.nodes.all()
    ]
    tree_json = json.dumps({"id": str(tree.id), "name": tree.name, "nodes": nodes})
    return render(request, "trees/tree.html", {"tree": tree, "tree_json": tree_json})


@require_POST
def delete_node(request, tree_id, node_id):
    tree = get_object_or_404(Tree, id=tree_id)
    node = get_object_or_404(Node, id=node_id, tree=tree)

    def collect_ids(n):
        ids = [str(n.id)]
        for child in n.children.all():
            ids.extend(collect_ids(child))
        return ids

    deleted_ids = collect_ids(node)
    node.delete()
    return JsonResponse({"type": "nodes_deleted", "ids": deleted_ids})


@require_POST
def update_node(request, tree_id, node_id):
    tree = get_object_or_404(Tree, id=tree_id)
    node = get_object_or_404(Node, id=node_id, tree=tree)
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON."}, status=400)

    content = body.get("content", {})
    if not isinstance(content, dict):
        return JsonResponse({"error": "content must be an object."}, status=400)
    if "label" in content and not str(content["label"]).strip():
        return JsonResponse({"error": "label cannot be empty."}, status=400)
    if "shape" in content and content["shape"] not in ("rect", "circle"):
        return JsonResponse({"error": "shape must be rect or circle."}, status=400)

    node.content.update(content)
    node.save()
    return JsonResponse({
        "type": "node_updated",
        "node": {
            "id": str(node.id),
            "parent_id": str(node.parent_id) if node.parent_id else None,
            "content": node.content,
        },
    })


@require_POST
def add_node(request, tree_id):
    tree = get_object_or_404(Tree, id=tree_id)
    try:
        body = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON."}, status=400)

    parent_id = body.get("parent_id")
    content = body.get("content", {})

    if not isinstance(content, dict):
        return JsonResponse({"error": "content must be an object."}, status=400)
    if not content.get("label", "").strip():
        return JsonResponse({"error": "label is required."}, status=400)
    if content.get("shape") not in ("rect", "circle"):
        return JsonResponse({"error": "shape must be rect or circle."}, status=400)

    parent = None
    if parent_id:
        parent = get_object_or_404(Node, id=parent_id, tree=tree)

    node = Node.objects.create(tree=tree, parent=parent, content=content)
    return JsonResponse({
        "type": "node_added",
        "node": {
            "id": str(node.id),
            "parent_id": str(node.parent_id) if node.parent_id else None,
            "content": node.content,
        },
    })

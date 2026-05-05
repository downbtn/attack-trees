from django.urls import path
from . import views

app_name = "trees"

urlpatterns = [
    path("", views.index, name="index"),
    path("tree/<uuid:tree_id>/", views.tree_detail, name="detail"),
    path("tree/<uuid:tree_id>/nodes/", views.add_node, name="add_node"),
    path("tree/<uuid:tree_id>/nodes/<uuid:node_id>/", views.update_node, name="update_node"),
    path("tree/<uuid:tree_id>/nodes/<uuid:node_id>/delete/", views.delete_node, name="delete_node"),
]

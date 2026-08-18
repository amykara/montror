from rest_framework.pagination import PageNumberPagination


class CataloguePagination(PageNumberPagination):
    """Le frontend charge le catalogue entier pour filtrer côté client.
    On lui laisse demander une grande page, sans permettre d'aspirer la base."""

    page_size_query_param = "page_size"
    max_page_size = 200

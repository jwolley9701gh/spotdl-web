from django.test import TestCase
from django.db import connection


class DatabaseConnectionTestCase(TestCase):
    def test_database_connection(self):
        try:
            # Check if the database connection is usable
            connection.ensure_connection()
            self.assertTrue(
                connection.is_usable(), "Database connection is not usable."
            )
        except Exception as e:
            self.fail(f"Database connection test failed: {e}")


# Create your tests here.

from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase
from datetime import date

from forge_api.auth import AuthRepository
from forge_api.models import TrainingProfile, UserRegistration


class AuthRepositoryTest(TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        self.repository = AuthRepository(Path(self.temp_dir.name) / "forge.db")
        self.registration = UserRegistration(
            login_id="test_user",
            email="test@example.com",
            password="StrongPass123!",
            username="Test User",
            birth_date=date(1995, 1, 1),
            weight_kg=74.2,
            purpose=TrainingProfile.powerlifting,
            notifications=True,
            bench_max=100,
            squat_max=None,
            deadlift_max=180,
            target_weight_kg=80,
            goal_text="ベンチプレス150kg",
        )

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_registration_authentication_and_session(self) -> None:
        user = self.repository.create_user(self.registration)
        self.assertEqual(user["login_id"], "test_user")
        self.assertEqual(user["birth_date"], "1995-01-01")
        self.assertEqual(user["member_number"], "AIMUS-00000001")
        self.assertNotIn("password_hash", user)
        self.assertIsNone(
            self.repository.authenticate("test_user", "incorrect-password")
        )
        authenticated = self.repository.authenticate(
            "test_user",
            "StrongPass123!",
        )
        self.assertEqual(authenticated["id"], user["id"])

        token = self.repository.create_session(user["id"], days=180)
        self.assertEqual(self.repository.user_from_session(token)["id"], user["id"])
        self.repository.delete_session(token)
        self.assertIsNone(self.repository.user_from_session(token))
        registry = (Path(self.temp_dir.name) / "user_registry.csv").read_text(
            encoding="utf-8-sig"
        )
        self.assertIn("member_number", registry)
        self.assertNotIn("password", registry.lower())

    def test_duplicate_login_id_is_rejected_case_insensitively(self) -> None:
        self.repository.create_user(self.registration)
        duplicate = self.registration.model_copy(update={"login_id": "TEST_USER"})
        with self.assertRaises(ValueError):
            self.repository.create_user(duplicate)

    def test_password_reset_token_is_single_use(self) -> None:
        user = self.repository.create_user(self.registration)
        reset = self.repository.create_password_reset(user["email"])
        self.assertIsNotNone(reset)
        token, _ = reset
        self.assertTrue(self.repository.reset_password(token, "ChangedPass123!"))
        self.assertFalse(self.repository.reset_password(token, "AnotherPass123!"))
        authenticated = self.repository.authenticate("test_user", "ChangedPass123!")
        self.assertEqual(authenticated["id"], user["id"])

    def test_profile_login_id_and_password_updates(self) -> None:
        user = self.repository.create_user(self.registration)

        updated_profile = self.repository.update_profile(
            user["id"],
            username="Updated User",
            birth_date="1996-02-03",
        )
        self.assertEqual(updated_profile["username"], "Updated User")
        self.assertEqual(updated_profile["birth_date"], "1996-02-03")

        updated_id = self.repository.update_login_id(
            user["id"],
            login_id="updated_user",
            current_password="StrongPass123!",
        )
        self.assertEqual(updated_id["login_id"], "updated_user")
        self.assertIsNone(self.repository.authenticate("test_user", "StrongPass123!"))

        self.repository.update_password(
            user["id"],
            current_password="StrongPass123!",
            new_password="ChangedAgain123!",
        )
        self.assertIsNone(self.repository.authenticate("updated_user", "StrongPass123!"))
        self.assertIsNotNone(
            self.repository.authenticate("updated_user", "ChangedAgain123!")
        )

    def test_admin_role_account_status_and_audit_log(self) -> None:
        user = self.repository.create_user(self.registration)
        self.repository.promote_configured_admins(["test_user"])
        admin = self.repository.get_user(user["id"])
        self.assertEqual(admin["role"], "admin")

        token = self.repository.create_session(user["id"], days=1)
        self.assertIsNotNone(self.repository.user_from_session(token))
        disabled = self.repository.set_user_active(user["id"], False)
        self.assertFalse(disabled["is_active"])
        self.assertIsNone(self.repository.user_from_session(token))
        self.assertIsNone(self.repository.authenticate("test_user", "StrongPass123!"))

        enabled = self.repository.set_user_active(user["id"], True)
        self.assertTrue(enabled["is_active"])
        self.repository.write_audit_log(
            enabled,
            "user_enabled",
            target_user_id=user["id"],
            ip_address="127.0.0.1",
        )
        logs = self.repository.list_audit_logs()
        self.assertEqual(logs[0]["action"], "user_enabled")
        self.assertEqual(self.repository.admin_stats()["admins"], 1)

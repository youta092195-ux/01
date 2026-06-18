from forge_api.pose import angle


def test_angle_is_ninety_degrees() -> None:
    assert round(angle((1, 0, 0), (0, 0, 0), (0, 1, 0))) == 90


def test_angle_is_straight() -> None:
    assert round(angle((-1, 0, 0), (0, 0, 0), (1, 0, 0))) == 180


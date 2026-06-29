"""HAL tests."""

from core.hal import get_hal, reset_hal


def test_mock_hal_pwm():
    reset_hal()
    hal = get_hal(mock=True)
    pwm = hal.setup_pwm(13, "demo", freq=100, initial_dc=50.0)
    pwm.value = 0.75
    assert pwm.value == 0.75
    hal.cleanup_all()
    reset_hal()

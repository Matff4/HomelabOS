"""Hardware abstraction — mock on dev machines, gpiozero on Pi."""

from __future__ import annotations

import logging
from typing import Any, Protocol

logger = logging.getLogger(__name__)


class PWMDevice(Protocol):
    @property
    def value(self) -> float: ...

    @value.setter
    def value(self, duty: float) -> None: ...

    def close(self) -> None: ...


class DigitalInput(Protocol):
    def close(self) -> None: ...


class HardwareRegistry(Protocol):
    def setup_pwm(self, pin: int, owner: str, freq: int, initial_dc: float) -> PWMDevice: ...

    def setup_interrupt(self, pin: int, owner: str, callback) -> None: ...

    def release_pin(self, pin: int, owner: str) -> None: ...

    def cleanup_all(self) -> None: ...


class MockPWMDevice:
    def __init__(self, pin: int, initial_dc: float) -> None:
        self.pin = pin
        self._value = initial_dc / 100.0

    @property
    def value(self) -> float:
        return self._value

    @value.setter
    def value(self, duty: float) -> None:
        self._value = duty

    def close(self) -> None:
        pass


class MockDigitalInput:
    def __init__(self, pin: int) -> None:
        self.pin = pin

    def close(self) -> None:
        pass


class MockHardwareRegistry:
    """In-memory HAL for HOMELABOS_DEV=1 / mock_hal."""

    def __init__(self) -> None:
        self.pins: dict[int, dict[str, Any]] = {}

    def setup_pwm(self, pin: int, owner: str, freq: int, initial_dc: float) -> MockPWMDevice:
        if pin in self.pins and self.pins[pin]["owner"] != owner:
            raise RuntimeError(f"Pin {pin} is owned by '{self.pins[pin]['owner']}'")
        device = MockPWMDevice(pin, initial_dc)
        self.pins[pin] = {"owner": owner, "mode": "PWM", "obj": device}
        logger.debug("[mock HAL] PWM pin %s -> %s", pin, owner)
        return device

    def setup_interrupt(self, pin: int, owner: str, callback) -> None:
        if pin in self.pins and self.pins[pin]["owner"] != owner:
            raise RuntimeError(f"Pin {pin} is owned by '{self.pins[pin]['owner']}'")
        device = MockDigitalInput(pin)
        self.pins[pin] = {"owner": owner, "mode": "INTERRUPT", "obj": device}
        logger.debug("[mock HAL] interrupt pin %s -> %s", pin, owner)

    def release_pin(self, pin: int, owner: str) -> None:
        entry = self.pins.get(pin)
        if entry and entry["owner"] == owner:
            entry["obj"].close()
            del self.pins[pin]

    def cleanup_all(self) -> None:
        for entry in self.pins.values():
            entry["obj"].close()
        self.pins.clear()


class GpioHardwareRegistry:
    """Real GPIO via gpiozero (Pi only)."""

    def __init__(self) -> None:
        self.pins: dict[int, dict[str, Any]] = {}

    def setup_pwm(self, pin: int, owner: str, freq: int, initial_dc: float):
        from gpiozero import PWMOutputDevice

        if pin in self.pins and self.pins[pin]["owner"] != owner:
            raise RuntimeError(f"Pin {pin} is owned by '{self.pins[pin]['owner']}'")
        if pin in self.pins and self.pins[pin]["mode"] == "PWM":
            return self.pins[pin]["obj"]

        pwm = PWMOutputDevice(pin, frequency=freq)
        pwm.value = initial_dc / 100.0
        self.pins[pin] = {"owner": owner, "mode": "PWM", "obj": pwm}
        logger.info("[HAL] PWM pin %s allocated to %s", pin, owner)
        return pwm

    def setup_interrupt(self, pin: int, owner: str, callback) -> None:
        from gpiozero import DigitalInputDevice

        if pin in self.pins and self.pins[pin]["owner"] != owner:
            raise RuntimeError(f"Pin {pin} is owned by '{self.pins[pin]['owner']}'")
        if pin in self.pins and self.pins[pin]["mode"] == "INTERRUPT":
            return

        sensor = DigitalInputDevice(pin, pull_up=True, bounce_time=None)
        sensor.when_activated = callback
        self.pins[pin] = {"owner": owner, "mode": "INTERRUPT", "obj": sensor}
        logger.info("[HAL] interrupt pin %s allocated to %s", pin, owner)

    def release_pin(self, pin: int, owner: str) -> None:
        entry = self.pins.get(pin)
        if entry and entry["owner"] == owner:
            entry["obj"].close()
            del self.pins[pin]

    def cleanup_all(self) -> None:
        for entry in self.pins.values():
            try:
                entry["obj"].close()
            except Exception:
                pass
        self.pins.clear()


_registry: HardwareRegistry | None = None


def get_hal(*, mock: bool) -> HardwareRegistry:
    global _registry
    if _registry is None:
        _registry = MockHardwareRegistry() if mock else GpioHardwareRegistry()
    return _registry


def reset_hal() -> None:
    """Test helper — drop cached registry."""
    global _registry
    if _registry is not None:
        _registry.cleanup_all()
    _registry = None

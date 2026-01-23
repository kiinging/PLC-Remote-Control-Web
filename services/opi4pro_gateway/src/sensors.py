"""
Sensor drivers for Orange Pi 4 Pro
Provides unified interface to various temperature sensors
"""

from src.max31865 import MAX31865
from src.max31855 import MAX31855

__all__ = ['MAX31865', 'MAX31855']

cat /sys/class/thermal/thermal_zone*/temp
chmod +x setup.sh

# commands for wifi
nmcli device wifi
nmcli connection show
sudo nmcli -s -g 802-11-wireless-security.psk connection show GL-SFT1200-b6e-5G 

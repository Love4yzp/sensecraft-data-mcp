#ifndef CONFIG_H
#define CONFIG_H

// WiFi配置
const char* WIFI_SSID = "你的WiFi名称";
const char* WIFI_PASSWORD = "你的WiFi密码";

// sensecraft data平台的配置
const char* SENSECRAFT_DATA_PAAS_DEVICE_EUI = "你的设备EUI";  // 设备的唯一标识符
const char* SENSECRAFT_DATA_DEVICE_TOKEN = "你的设备访问sensecraft data平台的token";  // 你的设备访问sensecraft data平台的token
const char* SENSECRAFT_DATA_DEVICE_MEASUREMENT_UPLINK_URL = "https://intranet-sensecap-env-expose-publicdns.seeed.cc/deviceapi/device/report_data"; // 向sensecraft data平台上报传感器采集数据的地址

#endif // CONFIG_H
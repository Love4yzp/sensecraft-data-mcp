#ifndef CONFIG_H
#define CONFIG_H

// WiFi配置
const char* WIFI_SSID = "你的WiFi名称";
const char* WIFI_PASSWORD = "你的WiFi密码";

// sensecraft data(sensecap paas)平台的配置
const char* SENSECRAFT_DATA_PAAS_DEVICE_EUI = "你的设备EUI";  // 设备的唯一标识符
const char* SENSECRAFT_DATA_DEVICE_TOKEN = "你的设备访问sensecraft data(sensecap paas)平台的token";  // 你的设备访问sensecraft data(sensecap paas)平台的token
const char* SENSECRAFT_DATA_DEVICE_MEASUREMENT_UPLINK_URL = "http://sensecapv1.seeed.cc/openapi/v3/device/measurements"; // 向sensecraft data(sensecap paas)平台上报传感器采集数据的地址

#endif // CONFIG_H
#include <ArduinoJson.h>

// 获取当前环境的温湿度代码, 以StaticJsonDocument格式返回
StaticJsonDocument tem_hum_collect() {
    // 读取温度和湿度传感器数据
    float temperature = 25.7;
    float humidity = 85.1;
    StaticJsonDocument<200> doc;
    doc["temperature"] = temperature;
    doc["humidty"] = humidity;
    return doc;
}
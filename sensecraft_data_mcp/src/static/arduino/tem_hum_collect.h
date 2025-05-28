#ifndef TEM_HUM_COLLECT_H
#define TEM_HUM_COLLECT_H

#include <ArduinoJson.h>
#include <DFRobot_DHT20.h>

DFRobot_DHT20 dht20;

// 初始化 DHT20 温湿度传感器的方法, 请在项目初始化阶段调用, 否则传感器无法使用
void tem_hum_collect_init(int SDA_PIN, int SCL_PIN) {
    Wire.begin(SDA_PIN, SCL_PIN);
    delay(1000);
    while (dht20.begin()) {
        Serial.println("init dht20 failed");
        delay(1000);
    }
    Serial.println("init dht20 success");
}

// 获取当前环境的温湿度代码, 以JsonDocument格式返回, 此部分有涉及DHT设备读取的代码, 请在 platformIO 的配置文件中, 添加依赖:dfrobot/DFRobot_DHT20@^1.0.0
JsonDocument tem_hum_collect() {
    // 读取温度和湿度传感器数据
    float temperature = dht20.getTemperature();
    float humidity = dht20.getHumidity() * 100;
    JsonDocument doc;
    doc["temperature"] = temperature;
    doc["humidty"] = humidity;
    return doc;
}

#endif
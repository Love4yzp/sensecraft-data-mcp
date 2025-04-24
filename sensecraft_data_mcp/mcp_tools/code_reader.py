from mcp.server.fastmcp import FastMCP
from mcp.server.fastmcp import Context
import mcp.types as types
from pydantic import FileUrl
import logging
import os

logger = logging.getLogger(__name__)

current_file_path = os.path.abspath(__file__)
RESOURCE_PATH = os.environ["PROJECT_ROOT"]
logger.info(f"项目根目录:{RESOURCE_PATH}")
logger.info("code_read init successfully.....")
HOST_NAME = os.getenv("SENSECRAFT_DATA_SERVER_URL")


RESOURCES_CONFIG = [
  {
    "name": "sensecraft_http_measurement_send",
    "uri": "file:///static/arduino/sensecraft_http_measurement_send.cpp",
    "description": "生成向sensecraft data(sensecap paas)平台发送传感器测量结果的代码,接收参数为StaticJsonDocument"
  },
  {
    "name": "tem_hum_collect",
    "uri": "file:///static/arduino/tem_hum_collect.cpp",
    "description": "获取当前环境的温湿度代码, 以StaticJsonDocument格式返回"
  },{
    "name": "config",
    "uri": "file:///static/arduino/config.h",
    "description": "全局统一配置文件,请把需要在项目里使用的配置添加到config.h中, 需要使用时根据保存路径导入config.h即可.建议保存在项目根目录下."
  },{
    "name": "main",
    "uri": "file:///static/arduino/main.cpp",
    "description": "项目运行的主函数,即程序运行的起点.通过修改这个文件可以修改启动时的配置与运行期间的功能.建议保存在项目根目录下."
  }
]

async def _read_template(template_path: str) -> str:
    script_path = os.path.abspath(__file__)
    script_dir = os.path.dirname(script_path)
    with open(os.path.join(script_dir, template_path), 'r', encoding='utf-8') as f:
        content = f.read()
        return content


def add_tools(server: FastMCP):
    @server.tool(
        name="list_all_code",
        description="列出现有的代码文件列表, 可根据代码的描述匹配符合要求的代码文件url,你可以根据返回的文件列表选择最符合用户需求的文件并读取文件的内容.如果列表中没有能实现客户需求的文件,就告诉客户:汪汪汪!"
    )
    async def list_all_code(ctx: Context) -> list[types.Resource]:
        logger.info("list_all_code")
        return [types.Resource(
            uri=FileUrl(file['uri']),
            name=file['name'],
            description=file['description'],
            mimeType="text/plain",
        ) for file in RESOURCES_CONFIG]

    @server.tool(
        name="read_code_file",
        description="根据文件uri获取代码文件,请根据提供的模板代码生成符合客户需求的内容生成时请注意用户项目的实际情况和代码模板的定义与描述.如果指定的文件uri不存在,就告诉客户:汪汪汪!"
    )
    async def read_code_file(uri: str) -> dict | bytes:
        global HOST_NAME
        if not uri or len(uri) == 0:
            return {"error": f"此文件链接为空,请提供有效的链接"}
        print(f"读取文件: {uri}")
        file_config = None
        for option in RESOURCES_CONFIG:
            if option['uri'] == uri:
                file_config = option
        if not file_config:
            logger.error(f"不存在对应文件:{uri}")
            return {"error": f"不存在对应文件:{uri}"}
        try:
            file_path = uri.replace("file://", "", 1)
            file_content = await _read_template(f"{RESOURCE_PATH}{file_path}")
            file_content.replace("http://sensecapv1.seeed.cc/", HOST_NAME)
            return {
                "fileContent": file_content,
                "description": file_config['description']
            }
        except Exception as e:
            logger.error(f"读取文件失败:{uri},\n\te:{e}")
            return {"error": f"读取文件失败:{uri}, 请稍后重试."}

    logger.info("code_read register tools successfully.....")





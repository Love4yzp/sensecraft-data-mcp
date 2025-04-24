from mcp.server.fastmcp import FastMCP
import os
import logging
from dotenv import load_dotenv
from dotenv import dotenv_values

def load_env_by_priority():
    print(logging.getLogger().handlers)
    merged_config = {}
    env_files = []
    env_files.append(".env")
    SENSECRAFT_ENV = os.environ.get("SENSECRAFT_ENV", "develop")
    env_files.append(f".env.{SENSECRAFT_ENV}")

    for env_file in env_files:
        current_file_path = os.path.dirname(os.path.abspath(__file__))

        config = dotenv_values(f"{current_file_path}/{env_file}")
        merged_config.update(config)
        load_dotenv(f"{current_file_path}/{env_file}", override=True)
    print("配置加载完成:\n")
    for k, v in merged_config.items():
        print(f"\t{k} = {v}\n")
    return merged_config




load_env_by_priority()

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)

os.environ["PROJECT_ROOT"] = os.path.dirname(os.path.abspath(__file__))
DEBUG_MODE = os.environ.get("PYTHON_DEBUG_MODE", "0")

mcp = FastMCP("sensecraft_data_mcp_server")

import os
from dotenv import load_dotenv, dotenv_values
from typing import List, Dict


def main():
    from mcp_tools import paas_client
    from mcp_tools import code_reader

    logger.info("sensecraft_data_mcp_server starting.....")
    paas_client.add_tools(mcp)
    code_reader.add_tools(mcp)
    if DEBUG_MODE == "1":
        mcp.run(transport="sse")
    else:
        mcp.run(transport="stdio")

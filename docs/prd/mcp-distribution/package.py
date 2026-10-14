"""Validate and archive the fixed, repository-owned plugin without network access."""
import argparse
import json
import re
from pathlib import Path
import struct
import sys
import zipfile

from jsonschema import Draft202012Validator

REPO = Path(__file__).resolve().parents[3]
SOURCE = REPO / "plugins/fudoki"
SCHEMAS = Path(__file__).parent / "schemas"
FILES = {
    "plugin.json", "mcp.json", ".claude-plugin/plugin.json", ".mcp.json",
    "README.md", "LICENSE", "skills/compare-expenditure/SKILL.md", "assets/icon.png", "assets/icon.svg",
}


def validate(files: dict[str, bytes]) -> dict:
    if set(files) != FILES:
        raise ValueError("Unexpected or missing plugin files")
    manifest = json.loads(files["plugin.json"])
    if manifest["name"] != "fudoki" or not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", manifest.get("version", "")):
        raise ValueError("Plugin identity or version is invalid")
    mcp = json.loads(files["mcp.json"])
    for name, value in [("plugin", manifest), ("mcp", mcp)]:
        schema = json.loads((SCHEMAS / f"{name}.schema.json").read_text())
        Draft202012Validator(schema).validate(value)
    claude = json.loads(files[".claude-plugin/plugin.json"])
    for key in ["name", "version", "description", "author", "homepage", "repository", "license"]:
        if manifest[key] != claude[key]:
            raise ValueError(f"Claude manifest differs: {key}")
    if claude["mcpServers"] != "./.mcp.json":
        raise ValueError("Claude MCP path changed")
    endpoint = "https://api.fudoki.dev/mcp"
    if mcp["mcpServers"] != {"fudoki": {"type": "streamable-http", "url": endpoint}}:
        raise ValueError("Portable MCP must use only the existing remote endpoint")
    if json.loads(files[".mcp.json"]) != {"mcpServers": {"fudoki": {"type": "http", "url": endpoint}}}:
        raise ValueError("Claude MCP must use only the existing remote endpoint")
    extension = manifest["extensions"]["com.openai"]
    for value in [manifest, claude]:
        if value.get("apps") is not None or value.get("extensions", {}).get("com.openai", {}).get("apps") is not None:
            raise ValueError("Registered app mappings cannot enter a public upload")
    interface = extension["interface"]
    for key, maximum in [("displayName", 30), ("shortDescription", 30), ("longDescription", 4000), ("developerName", 80)]:
        if not 0 < len(interface[key]) <= maximum:
            raise ValueError(f"Invalid listing length: {key}")
    prompts = interface["defaultPrompt"]
    if not 1 <= len(prompts) <= 3 or len(set(prompts)) != len(prompts) or any(not p.strip() or "\n" in p or len(p) > 128 for p in prompts):
        raise ValueError("Invalid starter prompts")
    for key in ["logo", "composerIcon"]:
        if interface[key] != "./assets/icon.png":
            raise ValueError(f"Unverified image reference: {key}")
    png = files["assets/icon.png"]
    if png[:8] != b"\x89PNG\r\n\x1a\n" or struct.unpack(">II", png[16:24]) != (256, 256) or len(png) > 5 * 1024 * 1024:
        raise ValueError("Icon must be a square 256px PNG under 5 MiB")
    skill = files["skills/compare-expenditure/SKILL.md"].decode()
    if not skill.startswith("---\nname: compare-expenditure\ndescription:") or not skill.split("---", 2)[1].split("description:", 1)[1].strip():
        raise ValueError("Skill frontmatter is missing")
    cases = extension["review"]["test_cases"]
    if len(cases["positive"]) != 5 or len(cases["negative"]) != 3:
        raise ValueError("Review needs five positive and three negative cases")
    for category in ["positive", "negative"]:
        keys = ["description", "prompt"] + (["tools_triggered", "expected_behavior"] if category == "positive" else [])
        for case in cases[category]:
            if any(not isinstance(case.get(k), str) or not case[k].strip() for k in keys):
                raise ValueError(f"Incomplete {category} case")
    gaps = [key for key in ["supportURL", "privacyPolicyURL", "termsOfServiceURL"] if not interface.get(key)]
    if not extension["review"].get("demo_recording_url"):
        gaps.append("demo_recording_url")
    return {"name": manifest["name"], "version": manifest["version"], "files": len(files), "package_valid": True,
            "public_submission_ready": False, "missing_metadata": gaps,
            "remaining_checks": ["publisher verification", "host installation and review cases", "listing screenshots", "portal validation and submission"]}


def source_files() -> dict[str, bytes]:
    files = {}
    for path in sorted(SOURCE.rglob("*")):
        if path.is_symlink():
            raise ValueError("Symlinks cannot enter the package")
        if path.is_file():
            files[path.relative_to(SOURCE).as_posix()] = path.read_bytes()
    return files


def validate_marketplaces():
    for path in [".agents/plugins/marketplace.json", ".claude-plugin/marketplace.json", ".cursor-plugin/marketplace.json"]:
        data = json.loads((REPO / path).read_text())
        if data["name"] != "fudoki-plugins" or len(data["plugins"]) != 1:
            raise ValueError(f"Invalid marketplace: {path}")
        entry = data["plugins"][0]
        source = entry["source"]
        target = source["path"] if isinstance(source, dict) else source
        if entry["name"] != "fudoki" or target != "./plugins/fudoki" or (REPO / target).resolve() != SOURCE:
            raise ValueError(f"Marketplace escapes or differs: {path}")
        if isinstance(source, dict) and (source.get("source") != "local" or entry.get("policy") != {"installation": "AVAILABLE", "authentication": "ON_INSTALL"} or entry.get("category") != "Productivity"):
            raise ValueError("Invalid OpenAI marketplace policy")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["check", "build"], help="check source or build and re-read a deterministic ZIP in .build/plugins")
    args = parser.parse_args()
    files = source_files()
    result = validate(files)
    validate_marketplaces()
    if args.command == "build":
        archive = REPO / f".build/plugins/fudoki-{result['version']}.zip"
        archive.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as output:
            for name, content in sorted(files.items()):
                info = zipfile.ZipInfo(f"fudoki/{name}", date_time=(2026, 10, 14, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                output.writestr(info, content)
        with zipfile.ZipFile(archive) as output:
            if output.testzip() is not None:
                raise ValueError("Corrupt ZIP")
            archived = {name.removeprefix("fudoki/"): output.read(name) for name in output.namelist()}
            validate(archived)
            if archived != files:
                raise ValueError("Archive differs from source")
        result["archive"] = str(archive)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"package_valid": False, "error": str(error)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)

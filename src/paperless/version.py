from typing import Final

__version__: Final[tuple[int, int, int]] = (2, 20, 13)
# Full version string including robo-ngx patch number.
# Must match pyproject.toml version field (e.g. "2.20.13.188").
__full_version_str__: Final[str] = "2.20.13.188"
# Version string like X.Y
__major_minor_version_str__: Final[str] = ".".join(map(str, __version__[:-1]))

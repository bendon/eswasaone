"""Allow ``python -m seed`` → ``seed.run``."""

from seed.run import main

raise SystemExit(main())

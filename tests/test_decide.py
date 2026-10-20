from worker.graph import decide

FOUND = [{"found": True}]
NOT_FOUND = [{"found": False}]


def test_found_defect_completes():
    assert decide(FOUND, 0) == "COMPLETE"


def test_no_defect_requests_photo_until_three():
    assert [decide(NOT_FOUND, r) for r in (0, 1, 2)] == ["PHOTO"] * 3


def test_no_defect_after_three_fails():
    assert decide(NOT_FOUND, 3) == "FAIL"

# Python Move 検知テスト用 Target: main_process を先頭に移動

def main_process():
    a = helper_alpha()
    b = helper_beta()
    return f"{a}-{b}"

def helper_alpha():
    return "alpha"

def helper_beta():
    return "beta"

import os
import pandas as pd
import json

class UserManager:
    def __init__(self, user_file=None, cookies_folder=None):
        self.user_file = user_file
        self.cookies_folder = cookies_folder
        self.users = []  # [{'username':..., 'password':..., 'cookies':...}]

    def load_users(self, user_file=None):
        if user_file:
            self.user_file = user_file
        if not self.user_file:
            return []
        ext = os.path.splitext(self.user_file)[1].lower()
        users = []
        if ext == '.csv':
            df = pd.read_csv(self.user_file, header=None, names=['username','password'])
            users = df.to_dict('records')
        elif ext == '.txt':
            with open(self.user_file, 'r', encoding='utf-8') as f:
                for line in f:
                    parts = line.strip().split(',')
                    if len(parts) == 2:
                        users.append({'username': parts[0], 'password': parts[1]})
        self.users = users
        return self.users

    def load_cookies(self, cookies_folder=None):
        if cookies_folder:
            self.cookies_folder = cookies_folder
        if not self.cookies_folder:
            return
        for user in self.users:
            cookie_path = os.path.join(self.cookies_folder, f"{user['username']}.json")
            if os.path.exists(cookie_path):
                with open(cookie_path, 'r', encoding='utf-8') as f:
                    user['cookies'] = json.load(f)
            else:
                user['cookies'] = None

    def get_users(self):
        return self.users

    def rotate_user(self):
        if self.users:
            user = self.users.pop(0)
            self.users.append(user)
            return user
        return None

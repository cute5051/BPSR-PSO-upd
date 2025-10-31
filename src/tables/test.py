import json

def transfer_specific_keys(source_file, target_file, keys_to_transfer, output_file=None, overwrite_existing=True):
    """
    Переносит только указанные ключи из source_file в target_file
    
    :param source_file: путь к исходному файлу JSON
    :param target_file: путь к целевому файлу JSON
    :param keys_to_transfer: список ключей для переноса
    :param output_file: путь для сохранения результата
    :param overwrite_existing: перезаписывать существующие ключи
    """
    try:
        # Чтение файлов
        with open(source_file, 'r', encoding='utf-8') as f:
            source_data = json.load(f)

        with open(target_file, 'r', encoding='utf-8') as f:
            target_data = json.load(f)

        transferred_count = 0
        
        # Проходим по всем ключам в целевом файле
        for skill_id in target_data:
            # Проверяем, существует ли такой же навык в исходном файле
            if skill_id in source_data:
                source_skill = source_data[skill_id]
                target_skill = target_data[skill_id]
                
                # Переносим указанные поля
                for field in keys_to_transfer:
                    if field in source_skill:
                        # Проверяем, нужно ли перезаписывать существующие поля
                        if field not in target_skill or overwrite_existing:
                            target_skill[field] = source_skill[field]
                            transferred_count += 1
                            # print(f"Перенесено: {skill_id}.{field}")
                    else:
                        print(f"Предупреждение: поле '{field}' не найдено в {skill_id}")
            else:
                print(f"Предупреждение: навык '{skill_id}' не найден в исходном файле")

        # Сохранение результата
        output_path = output_file or target_file
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(target_data, f, ensure_ascii=False, indent=2)

        print(f"\nУспешно перенесено {transferred_count} полей")
        print(f"Результат сохранен в: {output_path}")
        
        return transferred_count

    except FileNotFoundError as e:
        print(f"Ошибка: Файл не найден - {e}")
        return 0
    except json.JSONDecodeError as e:
        print(f"Ошибка: Некорректный JSON - {e}")
        return 0
    except Exception as e:
        print(f"Неизвестная ошибка: {e}")
        return 0

# Дополнительная функция для массового обновления
def batch_transfer_keys(source_file, target_file, keys_to_transfer, output_file=None):
    """
    Массовое обновление всех навыков в целевом файле
    """
    return transfer_specific_keys(source_file, target_file, keys_to_transfer, output_file, True)

if __name__ == "__main__":
    # Настройки
    source_json = "./src/tables/monster_table.json"
    target_json = "./src/tables/monster_names_en.json"
    output_json = "./src/tables/monster_names_en_upd.json"
    
    # Список ключей для переноса
    keys_to_transfer = [
        "MonsterType"
    ]
    
    # overwrite_existing=True - перезаписывать существующие поля
    # overwrite_existing=False - добавлять только новые поля (по умолчанию)
    transfer_specific_keys(
        source_json, 
        target_json, 
        keys_to_transfer, 
        output_json,
        overwrite_existing=True  # Измените на False если не хотите перезаписывать
    )
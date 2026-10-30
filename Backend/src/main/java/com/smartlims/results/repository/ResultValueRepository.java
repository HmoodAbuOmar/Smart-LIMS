package com.smartlims.results.repository;

import com.smartlims.results.entity.ResultValue;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ResultValueRepository extends JpaRepository<ResultValue,UUID>{boolean existsByParameter_Id(UUID parameter);}
